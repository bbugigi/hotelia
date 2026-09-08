import type { SyncEnqueueInput } from '@hotelia/shared';
import { EVENT_TYPES } from '@hotelia/events';
import { OfflineActionStore, type OfflineActionRecord } from './store';
import { logger } from '../logger';

/**
 * Background flusher for the SQLite offline store.
 *
 * Responsibilities:
 *   - claim PENDING/FAILED rows atomically (SQLite transaction),
 *   - deliver them to the sync backend (`HOTELIA_SYNC_URL`, default the local
 *     broker on 127.0.0.1:3110) with the Idempotency-Key header so the backend
 *     can dedupe post-retry and across restarts,
 *   - mark COMPLETED on 2xx, FAILED+retry_count++ otherwise,
 *   - surface a `SyncStatus` snapshot to callers AND push it to the renderer
 *     via the `onChanged` callback every time the counts change, so badge
 *     numbers in the UI never drift from the on-disk truth.
 *
 * The renderer therefore has NO queue of its own (see store.ts docblock).
 */

export interface SyncStatus {
  queued: number;
  processing: number;
  failed: number;
  online: boolean;
  oldest: number | null;
}

export interface OfflineSyncOptions {
  syncUrl?: string;
  token?: string;
  onChanged?: (status: SyncStatus) => void;
  flushIntervalMs?: number;
}

/**
 * Map queued console actions onto canonical domain events so the local broker
 * (which validates strictly against the event registry) accepts them and the
 * SSE subscribers (KDS, guest app) receive them with their real semantics.
 */
const ACTION_TO_EVENT: Record<string, string> = {
  checkin: EVENT_TYPES.RESERVATION_CHECKED_IN,
  checkout: EVENT_TYPES.RESERVATION_CHECKED_OUT,
  posOrder: EVENT_TYPES.ORDER_PLACED,
  roomKeyGenerate: EVENT_TYPES.ROOM_KEY_GENERATED,
  folioTransfer: EVENT_TYPES.FOLIO_BALANCE_UPDATED,
  maintenanceOrder: EVENT_TYPES.WORK_ORDER_CREATED,
};

const HTTP_OK = new Set([200, 201, 202, 204]);

export class OfflineSyncEngine {
  private readonly store: OfflineActionStore;
  private readonly syncUrl: string;
  private readonly token?: string;
  private readonly onChanged?: (status: SyncStatus) => void;
  private flushTimer: NodeJS.Timeout | null = null;
  private online = false;

  constructor(store: OfflineActionStore, options: OfflineSyncOptions = {}) {
    this.store = store;
    this.syncUrl =
      options.syncUrl ?? process.env.HOTELIA_SYNC_URL ?? 'http://127.0.0.1:3110/packet';
    this.token = options.token ?? process.env.HOTELIA_SERVER_TOKEN;
    this.onChanged = options.onChanged;
  }

  /** Boot the engine: recover crash-stuck PROCESSING rows, then flush loop. */
  start(): void {
    const requeued = this.store.requeueStaleProcessing();
    if (requeued > 0) logger.warn('sync:requeued-stale-processing', { count: requeued });
    void this.flush();
    this.flushTimer = setInterval(() => void this.flush(), 30000);
    this.flushTimer.unref();
  }

  stop(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  /**
   * Single writer entry point. Persist happens synchronously inside SQLite
   * (ACID) BEFORE returning the canonical record id to the renderer.
   */
  enqueue(input: SyncEnqueueInput): OfflineActionRecord {
    const record = this.store.insert(input);
    this.emitChanged();
    void this.flush();
    return record;
  }

  /** Immediate attempt to drain every currently-claimable action. */
  async flush(): Promise<SyncStatus> {
    await this.probeOnline();
    let claimed: OfflineActionRecord | null;
    let delivered = 0;
    // Guard against pathological infinite loops: each claim flips status so
    // the same id cannot loop; keep a sane ceiling per flush pass.
    while ((claimed = this.store.claimNext()) !== null && delivered < 500) {
      const ok = await this.deliver(claimed);
      if (ok) this.store.markComplete(claimed.id);
      else this.store.markFailed(claimed.id, 'delivery failed (timeout / non-2xx)');
      delivered += 1;
    }
    if (delivered > 0) this.emitChanged();
    return this.status();
  }

  status(): SyncStatus {
    const counts = this.store.countByStatus();
    let failed = counts.failed;
    // FAILED rows still under retry budget are "queued" for delivery purposes.
    return {
      queued: counts.pending + counts.processing,
      failed,
      processing: counts.processing,
      online: this.online,
      oldest: this.store.oldestPendingTs(),
    };
  }

  recent(): OfflineActionRecord[] {
    return this.store.listRecent();
  }

  close(): void {
    this.stop();
  }

  private async probeOnline(): Promise<void> {
    const probe = this.syncUrl.replace(/\/packet$/, '/health');
    try {
      const res = await fetch(probe, {
        signal: AbortSignal.timeout(4000),
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
      const was = this.online;
      this.online = res.ok;
      if (was !== this.online) this.emitChanged();
    } catch {
      const was = this.online;
      this.online = false;
      if (was) this.emitChanged();
    }
  }

  private async deliver(record: OfflineActionRecord): Promise<boolean> {
    const eventType = ACTION_TO_EVENT[record.actionType] ?? record.actionType;
    try {
      const res = await fetch(this.syncUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': record.idempotencyKey,
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ type: eventType, payload: record.payload }),
        signal: AbortSignal.timeout(8000),
      });
      return HTTP_OK.has(res.status);
    } catch (err) {
      logger.debug('sync:deliver-failed', { id: record.id });
      void err;
      return false;
    }
  }

  private emitChanged(): void {
    this.onChanged?.(this.status());
  }
}
