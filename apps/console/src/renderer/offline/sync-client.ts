import type { CommandResult, SyncAction, SyncEnqueueInput, SyncStatus } from '../types';

/**
 * Renderer-side offline client — READ-ONLY CACHE.
 *
 * This file is the *only* persistence touch-point the web UI has, and it
 * deliberately owns ZERO durable state. All writes go through
 * `window.hotelia.sync.enqueue` into the main-process SQLite store; the
 * renderer mirrors `SyncStatus` snapshots pushed down the single
 * `sync:updated` IPC channel purely so the sidebar badge counts instantly
 * without polling.
 *
 * This kills the dual-queue drift of the old IndexedDB + JSONL pair: there is
 * exactly one writer (better-sqlite3 in main) and one authoritative status.
 */

export async function unwrap<T>(call: Promise<CommandResult<T>>): Promise<T> {
  const res = await call;
  if (!res.success || res.data === undefined) {
    throw new Error(res.error ?? 'IPC call failed');
  }
  return res.data;
}

export function requireBridge(): NonNullable<Window['hotelia']> {
  if (!window.hotelia) throw new Error('Hotelia bridge unavailable (preload did not load)');
  return window.hotelia;
}

/**
 * Enqueue a critical mutation. Idempotent: the SAME idempotencyKey returns
 * the SAME canonical SQLite row, so double-tapping an already-qued action
 * never writes twice.
 */
export async function enqueueCritical(
  action: SyncAction,
  payload: Record<string, unknown>,
  idempotencyKey = crypto.randomUUID(),
): Promise<{ id: string; idempotencyKey: string }> {
  const input: SyncEnqueueInput = { actionType: action, payload, idempotencyKey };
  const record = await unwrap(window.hotelia?.sync.enqueue(input) ?? Promise.resolve(failedRes()));
  return { id: record.id, idempotencyKey: record.idempotencyKey };
}

function failedRes(): CommandResult<never> {
  return { success: false };
}

/** One-shot status snapshot (badge hydration on mount). */
export async function readSyncStatus(): Promise<SyncStatus | null> {
  if (!window.hotelia) return null;
  return unwrap(window.hotelia.sync.status()).catch(() => null);
}

/** Subscribe to main-pushed status changes; returns an unsubscribe function. */
export function subscribeSyncStatus(on: (status: SyncStatus) => void): () => void {
  if (!window.hotelia) return () => undefined;
  return window.hotelia.sync.subscribe(on);
}
