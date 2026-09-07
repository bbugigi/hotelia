import net from 'net';
import { EventEmitter } from 'events';

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
  ts: string;
}

/**
 * SmartLock encoder channel. The TCP implementation talks directly to on-LAN
 * encoder boxes (e.g. Assa Abloy / SALTO bridge) when the cloud is down, so a
 * front-desk operator can still issue physical keycards. Serial is plugged via
 * a provider so native serialport is optional at build time.
 * Loophole #1 fix (hardware half).
 */
export abstract class LockChannelAdapter {
  abstract readonly kind: LockChannels;
  abstract encode(req: EncodeRequest): Promise<EncodeResult>;
  abstract ping(): Promise<boolean>;
}

export class TcpLockChannel extends LockChannelAdapter {
  readonly kind: LockChannels = 'tcp';
  constructor(private endpoint: string) {
    super();
  }

  private static readonly ENCODE_CMD = Buffer.from('ENCODE', 'ascii');

  encode(req: EncodeRequest): Promise<EncodeResult> {
    return new Promise((resolve) => {
      const [host, rawPort] = this.endpoint.split(':');
      const port = Number(rawPort ?? 9100);
      const sock = net.connect({ host, port });

      const timeout = setTimeout(() => {
        sock.destroy();
        resolve(this.err(req, 'timeout talking to lock encoder'));
      }, 3000);

      sock.on('connect', () => {
        sock.write(this.buildPacket(req));
      });
      sock.on('data', (data) => {
        clearTimeout(timeout);
        sock.destroy();
        const ack = data.toString('ascii').trim();
        resolve({ ...this.base(req), status: ack.startsWith('OK') ? 'encoded' : 'error' });
      });
      sock.on('error', () => {
        clearTimeout(timeout);
        resolve(this.err(req, 'encoder unreachable on LAN (queued for sync)'));
      });
    });
  }

  ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const [host, rawPort] = this.endpoint.split(':');
      const sock = net.connect({ host: host ?? '127.0.0.1', port: Number(rawPort ?? 9100) });
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
  private err(req: EncodeRequest, msg: string): EncodeResult {
    const r = this.base(req);
    return { ...r, status: msg.includes('unreachable') ? 'queued_offline' : 'error', ts: r.ts };
  }
}

export class SerialLockChannel extends LockChannelAdapter {
  readonly kind: LockChannels = 'serial';
  constructor(
    private provider: LockSerialProvider | null,
    private pathHint = '/dev/ttyUSB0',
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
      return { ...base, status: 'queued_offline' };
    }
    const ok = await this.provider.write(req);
    return { ...base, status: ok ? 'encoded' : 'error' };
  }

  async ping(): Promise<boolean> {
    if (!this.provider) return false;
    return this.provider.ping();
  }
}

export interface LockSerialProvider {
  write(req: EncodeRequest): Promise<boolean>;
  ping(): Promise<boolean>;
}

export class LockBridgeController extends EventEmitter {
  private devices = new Map<string, LockDevice>();
  private channels = new Map<LockChannels, LockChannelAdapter>();
  private offlineQueue: EncodeRequest[] = [];

  constructor() {
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
  }

  list(): LockDevice[] {
    return [...this.devices.values()];
  }

  async encode(req: EncodeRequest): Promise<EncodeResult> {
    const dev = this.devices.get(req.deviceId);
    if (!dev) return { ...req, status: 'error', ts: new Date().toISOString() } as EncodeResult;
    const adapter = this.channels.get(dev.channel);
    if (!adapter) return { ...req, status: 'error', ts: new Date().toISOString() } as EncodeResult;

    const result = await adapter.encode(req);
    if (result.status === 'queued_offline') {
      this.offlineQueue.push(req);
      this.emit('offline-encode-queued', req);
    }
    return result;
  }
}
