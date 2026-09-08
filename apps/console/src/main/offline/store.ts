import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type {
  PaymentConfirmationInput,
  PaymentMethod,
  PaymentRecordInput,
  SyncEnqueueInput,
} from '@hotelia/shared';
import { logger } from '../logger';

/**
 * ───────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH OFFLINE QUEUE
 *
 * One SQLite database (better-sqlite3, ACID, `journal_mode=WAL`) owns EVERY
 * offline-critical mutation in install:
 *
 *   - front-desk check-in / check-out,
 *   - POS room postings that failed to reach the ledger,
 *   - door-lock encodes that could not reach the LAN encoder,
 *   - folio transfers, maintenance orders.
 *
 * ALONG-TERM REPLACEMENT of the previous dual persistence model
 * (renderer IndexedDB queue + main-process JSONL). That split drifted per
 * definition (two writers, two crash windows) and could deliver a renderer
 * that *looked* synced while the main queue silently lost a card encode.
 *
 * The renderer now keeps NO durable queue at all — it is a read-only cache of
 * `sync:updated` IPC snapshots for badge counts. Every write path funnels
 * through here inside synchronous SQLite transactions, so a power-loss at any
 * moment leaves the row PENDING (WAL is crash-safe, and `claimNext` is
 * atomic). Idempotency is enforced by the UNIQUE `idempotency_key` column —
 * reposting a check-in that was already persisted returns the SAME row with
 * no duplicate. This is the atomic-persistence guarantee.
 * ───────────────────────────────────────────────────────────────────────────
 */

export type ActionStatus = 'PENDING' | 'PROCESSING' | 'FAILED' | 'COMPLETED';

export const MAX_RETRY_COUNT = 8;

export interface OfflineActionRecord {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: ActionStatus;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface ActionStatusCounts {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
}

// ── Local payment reconciliation ledger (Kenya: M-Pesa Till/Paybill, cash) ─

export type PaymentKind = 'INTENT' | 'CONFIRMATION' | 'REVERSAL';
export type PaymentStatus = 'PENDING' | 'MATCHED' | 'UNMATCHED' | 'REVERSED';
export type EtimsState = 'NOT_APPLICABLE' | 'QUEUED' | 'TRANSMITTED';

export type PaymentLedgerRow = PaymentRecordInput & {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  etimsState: EtimsState;
  receipt?: string;
  recordedAt: string;
  matchedAt: string | null;
  matchedIntentId: string | null;
};

export interface MpesaLedgerSummary {
  pendingIntents: number;
  unmatchedConfirmations: number;
  matched: number;
  reversed: number;
  todayTotalMinorByMethod: Partial<Record<PaymentMethod, number>>;
}

function rowToPayment(row: Record<string, unknown>): PaymentLedgerRow {
  return {
    id: String(row.id),
    kind: row.kind as PaymentKind,
    status: row.status as PaymentStatus,
    etimsState: row.etims_state as EtimsState,
    method: row.method as PaymentMethod,
    amount: Number(row.amount_minor) / 100,
    currency: String(row.currency),
    guestName: row.guest_name ? String(row.guest_name) : (String(row.guest_name) as string),
    roomNumber: row.room_number ? String(row.room_number) : '',
    reference: row.reference ? String(row.reference) : undefined,
    receipt: row.receipt ? String(row.receipt) : undefined,
    folioId: row.folio_id ? String(row.folio_id) : undefined,
    reservationId: row.reservation_id ? String(row.reservation_id) : undefined,
    operatorId: row.operator_id ? String(row.operator_id) : undefined,
    idempotencyKey: String(row.idempotency_key),
    recordedAt: String(row.recorded_at),
    matchedAt: row.matched_at ? String(row.matched_at) : null,
    matchedIntentId: row.matched_intent_id ? String(row.matched_intent_id) : null,
  };
}

const PAYMENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS mpesa_ledger (
    id                TEXT PRIMARY KEY,
    kind              TEXT NOT NULL,
    status            TEXT NOT NULL,
    method            TEXT NOT NULL,
    amount_minor      INTEGER NOT NULL,
    currency          TEXT NOT NULL,
    reference         TEXT,
    receipt           TEXT,
    phone_tail        TEXT,
    guest_name        TEXT NOT NULL,
    room_number       TEXT,
    folio_id          TEXT,
    reservation_id    TEXT,
    operator_id       TEXT,
    etims_state       TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    idempotency_key   TEXT NOT NULL UNIQUE,
    recorded_at       TEXT NOT NULL,
    matched_at        TEXT,
    matched_intent_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_status  ON mpesa_ledger(status);
  CREATE INDEX IF NOT EXISTS idx_ledger_recorded ON mpesa_ledger(recorded_at);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_receipt
    ON mpesa_ledger(receipt) WHERE kind='CONFIRMATION' AND receipt IS NOT NULL;
`;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS offline_actions (
    id              TEXT PRIMARY KEY,
    action_type     TEXT NOT NULL,
    payload         TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_offline_actions_status     ON offline_actions(status);
  CREATE INDEX IF NOT EXISTS idx_offline_actions_created    ON offline_actions(created_at);
  CREATE INDEX IF NOT EXISTS idx_offline_actions_actiontype ON offline_actions(action_type);
`;

function rowToRecord(row: Record<string, unknown>): OfflineActionRecord {
  return {
    id: String(row.id),
    actionType: String(row.action_type),
    payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
    idempotencyKey: String(row.idempotency_key),
    status: row.status as ActionStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    retryCount: Number(row.retry_count),
    lastError: row.last_error ? String(row.last_error) : undefined,
  };
}

export class OfflineActionStore {
  private readonly db: Database.Database;

  constructor(dbPath = path.join(os.homedir(), '.hotelia', 'hotelia-console.db')) {
    const dir = path.dirname(dbPath);
    const { mkdirSync } = require('fs') as typeof import('fs');
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA + PAYMENT_SCHEMA);
    logger.info('sqlite-ready', { dbPath });
  }

  /**
   * Atomically insert a pending action. Idempotent by design: if a row with
   * the same `idempotency_key` already exists, the existing row is returned
   * and NO duplicate is created. The generated id is returned through IPC to
   * the renderer, which renders it as the canonical action reference.
   */
  insert(input: SyncEnqueueInput, now = new Date().toISOString()): OfflineActionRecord {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO offline_actions
        (id, action_type, payload, idempotency_key, status, created_at, updated_at, retry_count)
      VALUES (?, ?, ?, ?, 'PENDING', ?, ?, 0)
    `);
    const select = this.db.prepare(`
      SELECT id, action_type, payload, idempotency_key, status, created_at, updated_at, retry_count, last_error
      FROM offline_actions WHERE idempotency_key = ?
    `);

    const run = this.db.transaction(() => {
      const id = randomUUID();
      insert.run(
        id,
        input.actionType,
        JSON.stringify(input.payload),
        input.idempotencyKey,
        now,
        now,
      );
      return select.get(input.idempotencyKey);
    });

    return rowToRecord(run() as Record<string, unknown>);
  }

  /**
   * Atomically claim the next work item: PENDING first (oldest), then FAILED
   * (oldest, still under MAX_RETRY_COUNT). The claim flips the row to
   * PROCESSING within the same transaction so a crash mid-delivery cannot
   * double-send — the requeue on boot (`requeueStaleProcessing`) reconciles
   * anything left PROCESSING across a restart.
   */
  claimNext(now = new Date().toISOString()): OfflineActionRecord | null {
    const find = this.db.prepare(`
      SELECT id
      FROM offline_actions
      WHERE status = 'PENDING'
        OR (status = 'FAILED' AND retry_count < ?)
      ORDER BY
        CASE status WHEN 'PENDING' THEN 0 WHEN 'FAILED' THEN 1 ELSE 2 END,
        created_at ASC
      LIMIT 1
    `);
    const claim = this.db.prepare(
      `UPDATE offline_actions SET status='PROCESSING', updated_at=? WHERE id=?`,
    );
    const get = this.db.prepare(`
      SELECT id, action_type, payload, idempotency_key, status, created_at, updated_at, retry_count, last_error
      FROM offline_actions WHERE id = ?
    `);

    const tx = this.db.transaction(() => {
      const row = find.get(MAX_RETRY_COUNT) as { id: string } | null;
      if (!row) return null;
      claim.run(now, row.id);
      return get.get(row.id);
    });

    const claimed = tx();
    return claimed ? rowToRecord(claimed as Record<string, unknown>) : null;
  }

  markComplete(id: string, now = new Date().toISOString()): void {
    this.db
      .prepare(
        `UPDATE offline_actions SET status='COMPLETED', updated_at=?, last_error=NULL WHERE id=?`,
      )
      .run(now, id);
  }

  markFailed(id: string, error: string, now = new Date().toISOString()): void {
    this.db
      .prepare(
        `UPDATE offline_actions SET status='FAILED', retry_count=retry_count+1, last_error=?, updated_at=? WHERE id=?`,
      )
      .run(error, now, id);
  }

  /** Crash recovery: rows stuck in PROCESSING (e.g. killed mid-deliver) return to PENDING. */
  requeueStaleProcessing(beforeMs = 30_000, now = new Date().toISOString()): number {
    const cutoff = new Date(Date.now() - beforeMs).toISOString();
    const res = this.db
      .prepare(
        `UPDATE offline_actions SET status='PENDING', updated_at=? WHERE status='PROCESSING' AND updated_at < ?`,
      )
      .run(now, cutoff);
    return res.changes;
  }

  /** Crash recovery: FAILED rows past max retries are visibly terminal but printable. */
  countByStatus(): ActionStatusCounts {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS n FROM offline_actions GROUP BY status`)
      .all() as Array<{ status: ActionStatus; n: number }>;
    const counts: ActionStatusCounts = { pending: 0, processing: 0, failed: 0, completed: 0 };
    for (const r of rows) {
      const key = r.status.toLowerCase() as keyof ActionStatusCounts;
      counts[key] = Number(r.n);
    }
    return counts;
  }

  listRecent(limit = 25): OfflineActionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, action_type, payload, idempotency_key, status, created_at, updated_at, retry_count, last_error
         FROM offline_actions ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map(rowToRecord);
  }

  /** Precisely the query the KDS / guest badge shows; cheap and read-only. */
  oldestPendingTs(): number | null {
    const row = this.db
      .prepare(
        `SELECT MIN(created_at) AS ts FROM offline_actions WHERE status IN ('PENDING','FAILED','PROCESSING')`,
      )
      .get() as { ts: string | null };
    return row.ts ? new Date(row.ts).getTime() : null;
  }

  // ── Local payment reconciliation ledger ─────────────────────────────────
  // First-class M-Pesa (Till/Paybill) + cash payments. `INTENT` rows are what
  // we EXPECT (bill charged to a room), `CONFIRMATION` rows are what actually
  // LANDED (an M-Pesa STK/C2B confirmation). Matching is the unit of truth the
  // accountant reconciles against — stolen groundwork from Cloudbeds' "double
  // ledger" reporting failure. Amounts are stored as minor units (int cents).

  private toMinor(amount: number): number {
    return Math.round(amount * 100);
  }

  recordIntent(input: PaymentRecordInput, now = new Date().toISOString()): PaymentLedgerRow {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO mpesa_ledger
        (id, kind, status, method, amount_minor, currency, reference, guest_name, room_number,
         folio_id, reservation_id, operator_id, idempotency_key, recorded_at)
      VALUES (?, 'INTENT', 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const select = this.db.prepare(`SELECT * FROM mpesa_ledger WHERE idempotency_key = ?`);

    const run = this.db.transaction(() => {
      const id = randomUUID();
      insert.run(
        id,
        input.method,
        this.toMinor(input.amount),
        input.currency,
        input.reference ?? null,
        input.guestName,
        input.roomNumber,
        input.folioId ?? null,
        input.reservationId ?? null,
        input.operatorId ?? null,
        input.idempotencyKey,
        now,
      );
      return select.get(input.idempotencyKey);
    });
    return rowToPayment(run() as Record<string, unknown>);
  }

  /**
   * Record an M-Pesa confirmation (STK callback / C2B that actually landed).
   * Idempotent on the M-Pesa receipt number (a single receipt can never be
   * double-posted). Auto-matches a unique PENDING intent with the exact same
   * method + amount, preferring the oldest one.
   */
  recordConfirmation(
    input: PaymentConfirmationInput,
    now = new Date().toISOString(),
  ): PaymentLedgerRow {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO mpesa_ledger
        (id, kind, status, method, amount_minor, currency, reference, receipt, phone_tail,
         guest_name, room_number, idempotency_key, recorded_at)
      VALUES (?, 'CONFIRMATION', 'UNMATCHED', ?, ?, ?, ?, ?, ?, '', '', ?, ?)
    `);
    const select = this.db.prepare(`SELECT * FROM mpesa_ledger WHERE idempotency_key = ?`);
    const findIntent = this.db.prepare(`
      SELECT id FROM mpesa_ledger
      WHERE kind='INTENT' AND status='PENDING'
        AND method=? AND amount_minor=?
      ORDER BY recorded_at ASC
      LIMIT 2
    `);
    const matchBoth = this.db.prepare(`
      UPDATE mpesa_ledger SET status='MATCHED', matched_at=?, matched_intent_id=?
        WHERE id=?
    `);

    const run = this.db.transaction(() => {
      const id = randomUUID();
      insert.run(
        id,
        input.method,
        this.toMinor(input.amount),
        input.currency,
        input.reference ?? null,
        input.receipt,
        input.phoneTail ?? null,
        input.idempotencyKey,
        now,
      );
      const row = select.get(input.idempotencyKey) as Record<string, unknown>;
      if (!row) return rowToPayment(row as Record<string, unknown>);

      // Auto-match only when EXACTLY ONE candidate intent exists (no guessing
      // on ambiguous payments — the accountant decides those by hand).
      const candidates = findIntent.all(input.method, this.toMinor(input.amount)) as Array<{
        id: string;
      }>;
      if (candidates.length === 1) {
        matchBoth.run(now, candidates[0].id, String(row.id));
        matchBoth.run(now, String(row.id), candidates[0].id);
        row.status = 'MATCHED';
        row.matched_at = now;
        row.matched_intent_id = String(row.id);
      }
      return row;
    });
    return rowToPayment(run() as Record<string, unknown>);
  }

  /** Manual (accountant-led) link: a confirmation is joined to a specific intent. */
  matchConfirmation(
    confirmationId: string,
    intentId: string,
    operatorId?: string,
    now = new Date().toISOString(),
  ): PaymentLedgerRow | null {
    const tx = this.db.transaction((): PaymentLedgerRow | null => {
      const row = this.db
        .prepare(`SELECT * FROM mpesa_ledger WHERE id=?`)
        .get(confirmationId) as Record<string, unknown> | null;
      if (!row || row.kind !== 'CONFIRMATION') return null;
      this.db
        .prepare(
          `UPDATE mpesa_ledger SET status='MATCHED', matched_at=?, matched_intent_id=?, operator_id=COALESCE(?, operator_id) WHERE id=?`,
        )
        .run(now, intentId, operatorId ?? null, confirmationId);
      this.db
        .prepare(
          `UPDATE mpesa_ledger SET status='MATCHED', matched_at=?, matched_intent_id=? WHERE id=?`,
        )
        .run(now, confirmationId, intentId);
      return rowToPayment(row);
    });
    return tx();
  }

  listLedger(limit = 100): PaymentLedgerRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, kind, status, etims_state, method, amount_minor, currency, reference, receipt,
                guest_name, room_number, folio_id, reservation_id, operator_id, idempotency_key,
                recorded_at, matched_at, matched_intent_id
         FROM mpesa_ledger ORDER BY recorded_at DESC LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map(rowToPayment);
  }

  ledgerSummary(): MpesaLedgerSummary {
    const byStatus = this.db
      .prepare(`SELECT kind, status, COUNT(*) AS n FROM mpesa_ledger GROUP BY kind, status`)
      .all() as Array<{ kind: string; status: string; n: number }>;
    const summary: MpesaLedgerSummary = {
      pendingIntents: 0,
      unmatchedConfirmations: 0,
      matched: 0,
      reversed: 0,
      todayTotalMinorByMethod: {},
    };
    for (const r of byStatus) {
      if (r.kind === 'INTENT' && r.status === 'PENDING') summary.pendingIntents += Number(r.n);
      if (r.kind === 'CONFIRMATION' && r.status === 'UNMATCHED')
        summary.unmatchedConfirmations += Number(r.n);
      if (r.status === 'MATCHED') summary.matched += Number(r.n);
      if (r.status === 'REVERSED') summary.reversed += Number(r.n);
    }
    const today = new Date().toISOString().slice(0, 10);
    const totals = this.db
      .prepare(
        `SELECT method, SUM(amount_minor) AS total FROM mpesa_ledger
         WHERE status='MATCHED' AND substr(recorded_at,1,10)=? GROUP BY method`,
      )
      .all(today) as Array<{ method: PaymentMethod; total: number }>;
    for (const t of totals) summary.todayTotalMinorByMethod[t.method] = Number(t.total);
    return summary;
  }

  /** Flag a ledger row as eTIMS-eligible/queued (KRA transmission is the connector job). */
  markEtims(id: string, state: EtimsState): void {
    this.db.prepare(`UPDATE mpesa_ledger SET etims_state=? WHERE id=?`).run(state, id);
  }

  close(): void {
    this.db.close();
  }
}
