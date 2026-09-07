import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export type SyncAction =
  'checkin' | 'checkout' | 'roomKeyGenerate' | 'posOrder' | 'folioTransfer' | 'maintenanceOrder';

export interface SyncEnvelope {
  id: string;
  action: SyncAction;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

/**
 * Offline-first durable mutation queue. Every critical front-desk action is
 * persisted to disk BEFORE an attempt is made to reach the cloud backend, so a
 * hotel-WiFi drop never blocks a guest check-in or a room-key encode.
 * Loophole #1 fix.
 */
export class OfflineSyncEngine {
  private queueFile: string;
  private queue: SyncEnvelope[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private online = false;

  constructor() {
    this.queueFile = path.join(os.homedir(), '.hotelia', 'sync-queue.jsonl');
  }

  async start(): Promise<void> {
    await fs.mkdir(path.dirname(this.queueFile), { recursive: true });
    await this.load();
    this.flushTimer = setInterval(() => void this.flush(), 30000);
    void this.flush();
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.queueFile, 'utf8');
      this.queue = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SyncEnvelope);
    } catch {
      this.queue = [];
    }
  }

  private async persist(): Promise<void> {
    const lines = this.queue.map((e) => JSON.stringify(e)).join('\n');
    await fs.writeFile(this.queueFile, lines + (lines ? '\n' : ''), 'utf8');
  }

  /**
   * Enqueue a critical action. Returns immediately; the action will be delivered
   * to the backend when connectivity returns.
   */
  async enqueue(action: SyncAction, payload: Record<string, unknown>): Promise<SyncEnvelope> {
    const eth: SyncEnvelope = {
      id: crypto.randomUUID(),
      action,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    this.queue.push(eth);
    await this.persist();
    void this.flush();
    return eth;
  }

  async flush(): Promise<SyncStatus> {
    if (!this.queue.length) return this.status();
    this.online = await this.isBackendReachable();
    if (!this.online) return this.status();

    const remaining: SyncEnvelope[] = [];
    for (const eth of this.queue) {
      const ok = await this.deliver(eth);
      if (!ok) {
        eth.attempts += 1;
        eth.lastError = 'delivery failed (server rejected or timeout)';
        remaining.push(eth);
      }
    }
    this.queue = remaining;
    await this.persist();
    return this.status();
  }

  status(): SyncStatus {
    return {
      queued: this.queue.length,
      online: this.online,
      oldest:
        this.queue.length > 0
          ? Math.min(...this.queue.map((e) => new Date(e.createdAt).getTime()))
          : null,
    };
  }

  private async isBackendReachable(): Promise<boolean> {
    const url = process.env.HOTELIA_SYNC_URL ?? 'http://localhost:3110/health';
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async deliver(eth: SyncEnvelope): Promise<boolean> {
    const url = process.env.HOTELIA_SYNC_URL ?? 'http://localhost:3110/packet';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: eth.action, payload: eth.payload }),
        signal: AbortSignal.timeout(8000),
      });
      return res.status === 202 || res.status === 200 || res.status === 201;
    } catch {
      return false;
    }
  }
}

export interface SyncStatus {
  queued: number;
  online: boolean;
  oldest: number | null;
}
