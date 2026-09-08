import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type { SyncEnqueueInput } from '@hotelia/shared';
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
    this.db.exec(SCHEMA);
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

  close(): void {
    this.db.close();
  }
}
