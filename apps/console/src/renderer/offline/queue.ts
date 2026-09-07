import Dexie, { type Table } from 'dexie';
import type { SyncAction, SyncStatus } from '../types';

export interface QueuedMutation {
  id: string;
  action: SyncAction;
  payload: Record<string, unknown>;
  createdAt: string;
  delivered: boolean;
}

/**
 * Renderer-side IndexedDB queue. Every critical front-desk action is written
 * here FIRST (survives app restart), then handed to the main-process engine
 * for background sync. Loophole #1 fix (soft half).
 */
class HoteliaOfflineDb extends Dexie {
  queue!: Table<QueuedMutation, string>;

  constructor() {
    super('hotelia-offline');
    this.version(1).stores({
      queue: 'id, action, delivered, createdAt',
    });
  }
}

export const db = new HoteliaOfflineDb();

export async function enqueueCritical(
  action: SyncAction,
  payload: Record<string, unknown>,
): Promise<QueuedMutation> {
  const m: QueuedMutation = {
    id: crypto.randomUUID(),
    action,
    payload,
    createdAt: new Date().toISOString(),
    delivered: false,
  };
  await db.queue.put(m);

  try {
    if (window.hotelia) {
      await window.hotelia.sync.enqueue(action, payload);
      m.delivered = true;
      await db.queue.update(m.id, { delivered: true });
    }
  } catch {
    // Offline: stays queued, main process will flush when reachable.
  }
  return m;
}

export async function syncStatus(): Promise<SyncStatus> {
  const pending = await db.queue
    .toCollection()
    .filter((m) => !m.delivered)
    .count();
  const mainStatus = window.hotelia ? await window.hotelia.sync.status().catch(() => null) : null;
  return {
    queued: pending,
    online: mainStatus?.online ?? false,
    oldest: mainStatus?.oldest ?? null,
  };
}
