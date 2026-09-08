import net from 'net';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { LockEncodeInput, LockLinkInput } from '@hotelia/shared';
import { OfflineActionStore, type OfflineActionRecord } from '../offline/store';
import { logger } from '../logger';

/**
 * ───────────────────────────────────────────────────────────────────────────
 * HARDWARE BRIDGE — DOOR-LOCK ENCODERS
 *
 * Failure model (previous version hanging the IPC call on a dead encoder is
 * eliminated):
 *  1. Every TCP attempt is bounded by a 5 s connection timeout.
 *  2. Each encoder channel is guarded by a CircuitBreaker
 *     (CLOSED → OPEN → (cooldown) → CLOSED), plus a manual PAUSED state.
 *     Once OPEN, new encodes are rejected *immediately* without touching the
 *     socket; the item goes to the SQLite offline store instead.
 *  3. Any failure (timeout / unreachable / protocol-NACK / OPEN breaker)
 *     funnels the encode into the SAME `offline_actions` table used by every
 *     other critical action (idempotency_key = `lock:<deviceId>:<room>`), so
 *     the IPC call returns instantly with `status: 'queued_offline'` and the
 *     background retry loop re-attempts the LAN encoder on a 10 s cadence.
 *
 * The keycard is then *guaranteed*: either the encoder ack'd it live, or the
 * exact request is durable in SQLite and retried. No dual-queue drift.
 * ───────────────────────────────────────────────────────────────────────────
 */

export type LockChannels = 'tcp' | 'serial';

export interface LockDevice {
  id: string;
  channel: LockChannels;
  endpoint: string;
  model: string;
  online: boolean;
}

export interface EncodeRequest {
  deviceId: string;
  roomNumber: string;
  credential: string;
}

export interface EncodeResult {
  deviceId: string;
  roomNumber: string;
  credential: string;
  status: 'encoded' | 'queued_offline' | 'error';
  queuedId?: string;
  error?: string;
  ts: string;
}

// ── Circuit breaker ─────────────────────────────────────────────────────────

export type BreakerState = 'CLOSED' | 'OPEN' | 'PAUSED';

export class CircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 30_000,
  ) {}

  getState(): BreakerState {
    return this.state;
  }

  /** Would an encode be allowed to hit the wire right now? */
  allow(): boolean {
    if (this.state === 'PAUSED') return false;
    if (this.state === 'OPEN') {
      // Cooldown elapsed → half-open probe attempt.
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'CLOSED';
        this.consecutiveFailures = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
  }

  onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      logger.warn('lock:breaker-opened', {
        threshold: this.failureThreshold,
        cooldownMs: this.cooldownMs,
      });
    }
  }

  pause(): void {
    this.state = 'PAUSED';
  }

  resume(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
  }
}

// ── Transport adapters ────────────────────────────────────────────────────

export abstract class LockChannelAdapter {
  abstract readonly kind: LockChannels;
  abstract encode(req: EncodeRequest): Promise<EncodeResult>;
  abstract ping(): Promise<boolean>;
}

export class TcpLockChannel extends LockChannelAdapter {
  readonly kind: LockChannels = 'tcp';
  private static readonly ENCODE_CMD = Buffer.from('ENCODE', 'ascii');
  private static readonly CONNECT_TIMEOUT_MS = 5_000;

  constructor(private readonly endpoint: string) {
    super();
  }

  encode(req: EncodeRequest): Promise<EncodeResult> {
    return new Promise((resolve) => {
      const host = this.endpoint.split(':')[0];
      const port = Number(this.endpoint.split(':')[1] ?? 9100);
      let settled = false;
      const sock = net.connect({ host, port, timeout: TcpLockChannel.CONNECT_TIMEOUT_MS });
      const settle = (result: EncodeResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sock.destroy();
        resolve(result);
      };

      const timer = setTimeout(() => {
        settle(this.buildResult(req, 'queued_offline', 'encoder timed out (5000ms)'));
      }, TcpLockChannel.CONNECT_TIMEOUT_MS);

      sock.on('connect', () => {
        sock.setTimeout(TcpLockChannel.CONNECT_TIMEOUT_MS, () => {
          settle(this.buildResult(req, 'queued_offline', 'encoder read timeout (5000ms)'));
        });
        sock.write(this.buildPacket(req));
      });
      sock.on('data', (data) => {
        const ack = data.toString('ascii').trim();
        if (ack.startsWith('OK')) {
          settle(this.buildResult(req, 'encoded'));
        } else {
          settle(this.buildResult(req, 'error', `encoder NACK: ${ack}`));
        }
      });
      sock.on('timeout', () => {
        settle(this.buildResult(req, 'queued_offline', 'encoder timeout (no ACK within 5000ms)'));
      });
      sock.on('error', (err) => {
        settle(this.buildResult(req, 'queued_offline', `encoder unreachable: ${err.message}`));
      });
    });
  }

  ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const host = this.endpoint.split(':')[0];
      const port = Number(this.endpoint.split(':')[1] ?? 9100);
      const sock = net.connect({ host, port });
      const t = setTimeout(() => {
        sock.destroy();
        resolve(false);
      }, 1500);
      sock.on('connect', () => {
        clearTimeout(t);
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        clearTimeout(t);
        resolve(false);
      });
    });
  }

  private buildPacket(req: EncodeRequest): Buffer {
    const body = `${req.deviceId}|${req.roomNumber}|${req.credential}`;
    return Buffer.concat([
      TcpLockChannel.ENCODE_CMD,
      Buffer.from(body, 'ascii'),
      Buffer.from('\n'),
    ]);
  }

  private base(req: EncodeRequest): Omit<EncodeResult, 'status'> {
    return {
      deviceId: req.deviceId,
      roomNumber: req.roomNumber,
      credential: req.credential,
      ts: new Date().toISOString(),
    };
  }

  private buildResult(
    req: EncodeRequest,
    status: EncodeResult['status'],
    error?: string,
  ): EncodeResult {
    return { ...this.base(req), status, error };
  }
}

export class SerialLockChannel extends LockChannelAdapter {
  readonly kind: LockChannels = 'serial';
  constructor(
    private readonly provider: LockSerialProvider | null,
    private readonly pathHint = '/dev/ttyUSB0',
  ) {
    super();
  }

  async encode(req: EncodeRequest): Promise<EncodeResult> {
    const base = {
      deviceId: req.deviceId,
      roomNumber: req.roomNumber,
      credential: req.credential,
      ts: new Date().toISOString(),
    };
    if (!this.provider) {
      return { ...base, status: 'queued_offline', error: 'no serial provider configured' };
    }
    const ok = await this.provider.write(req);
    return { ...base, status: ok ? 'encoded' : 'error' };
  }

  async ping(): Promise<boolean> {
    return this.provider?.ping() ?? false;
  }
}

export interface LockSerialProvider {
  write(req: EncodeRequest): Promise<boolean>;
  ping(): Promise<boolean>;
}

// ── Controller ─────────────────────────────────────────────────────────────

const LOCK_ACTION_TYPE = 'roomKeyGenerate';

export class LockBridgeController extends EventEmitter {
  private devices = new Map<string, LockDevice>();
  private channels = new Map<LockChannels, LockChannelAdapter>();
  private breakers = new Map<string, CircuitBreaker>();
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly store?: OfflineActionStore) {
    super();
    this.channels.set('serial', new SerialLockChannel(null));
  }

  attach(channel: LockChannels, endpointOrProvider?: string | LockSerialProvider): void {
    if (channel === 'tcp' && typeof endpointOrProvider === 'string') {
      this.channels.set(channel, new TcpLockChannel(endpointOrProvider));
    } else if (channel === 'serial' && endpointOrProvider) {
      this.channels.set(
        channel,
        new SerialLockChannel(endpointOrProvider as LockSerialProvider, '/dev/ttyUSB0'),
      );
    }
  }

  registerDevice(d: LockDevice): void {
    this.devices.set(d.id, d);
    d.online = false;
  }

  list(): LockDevice[] {
    return [...this.devices.values()];
  }

  getBreaker(deviceId: string): CircuitBreaker {
    let b = this.breakers.get(deviceId);
    if (!b) {
      b = new CircuitBreaker();
      this.breakers.set(deviceId, b);
    }
    return b;
  }

  /**
   * Non-blocking encode path. Returns immediately with an EncodeResult; never
   * throws and never waits on the encoder beyond 5 s. Failures durable-queue
   * into SQLite and are retried in the background.
   */
  async encode(req: EncodeRequest): Promise<EncodeResult> {
    const dev = this.devices.get(req.deviceId);
    const base: Omit<EncodeResult, 'status'> = {
      deviceId: req.deviceId,
      roomNumber: req.roomNumber,
      credential: req.credential,
      ts: new Date().toISOString(),
    };
    if (!dev) {
      return { ...base, status: 'error', error: 'unknown encoder device' };
    }
    const adapter = this.channels.get(dev.channel);
    if (!adapter) {
      return { ...base, status: 'error', error: `no adapter for channel: ${dev.channel}` };
    }

    const breaker = this.getBreaker(req.deviceId);
    if (!breaker.allow()) {
      const queued = this.persistOffline(req);
      return {
        ...base,
        status: 'queued_offline',
        queuedId: queued.id,
        error: 'circuit open (fast-fail)->queued',
      };
    }

    const result = await adapter.encode(req);
    if (result.status === 'encoded') {
      breaker.onSuccess();
      dev.online = true;
      this.emit('encode-completed', result);
      return result;
    }

    breaker.onFailure();
    dev.online = false;
    const queued = this.persistOffline(req);
    this.ensureRetryLoop();
    return {
      ...result,
      status: 'queued_offline',
      queuedId: queued.id,
      error: result.error ?? 'encoder offline -> queued',
    };
  }

  /** Durably persist a failed encoder request into the shared SQLite store. */
  private persistOffline(req: EncodeRequest): OfflineActionRecord {
    const input = {
      actionType: LOCK_ACTION_TYPE as 'roomKeyGenerate',
      idempotencyKey: `lock:${req.deviceId}:${req.roomNumber}`,
      payload: { deviceId: req.deviceId, roomNumber: req.roomNumber, credential: req.credential },
    };
    this.emit('offline-encode-queued', req);
    if (!this.store) {
      // No store injected (headless) — still emit so callers stay informed.
      return {
        id: randomUUID(),
        ...input,
        status: 'FAILED' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        lastError: 'no offline store injected — caller must retry',
      };
    }
    try {
      return this.store.insert(input);
    } catch (err) {
      logger.error('lock:persist-offline-failed', { deviceId: req.deviceId }, err as Error);
      return {
        id: randomUUID(),
        ...input,
        status: 'FAILED' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        lastError: 'sqlite unavailable',
      };
    }
  }

  /** Background retry loop: drain LOCK_ACTION_TYPE rows from SQLite every 10 s. */
  private ensureRetryLoop(): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => void this.drainRetryQueue(), 10_000);
    this.retryTimer.unref();
  }

  private async drainRetryQueue(): Promise<void> {
    if (!this.store) return;
    for (;;) {
      const record = this.store.claimNext();
      if (!record) break;
      if (record.actionType !== LOCK_ACTION_TYPE) {
        // Not ours to deliver — put it back for the sync engine.
        this.store.markFailed(record.id, 'non-lock action removed from lock drain');
        continue;
      }
      const req: EncodeRequest = {
        deviceId: String(record.payload.deviceId),
        roomNumber: String(record.payload.roomNumber),
        credential: String(record.payload.credential),
      };
      const dev = this.devices.get(req.deviceId);
      if (!dev) {
        this.store.markFailed(record.id, 'encoder device no longer registered');
        continue;
      }
      const breaker = this.getBreaker(req.deviceId);
      const adapter = this.channels.get(dev.channel);
      if (!adapter || !breaker.allow()) {
        this.store.markFailed(record.id, 'breaker open / no adapter — will retry on next pass');
        continue;
      }
      const result = await adapter.encode(req);
      if (result.status === 'encoded') {
        breaker.onSuccess();
        dev.online = true;
        this.store.markComplete(record.id);
        this.emit('encode-completed', result);
        logger.info('lock:retry-succeeded', { deviceId: req.deviceId, room: req.roomNumber });
      } else {
        breaker.onFailure();
        dev.online = false;
        this.store.markFailed(record.id, result.error ?? 'encoder still offline');
      }
    }
  }

  shutdown(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }
}
