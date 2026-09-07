export interface HoteliaBridge {
  sync: {
    enqueue(action: SyncAction, payload: Record<string, unknown>): Promise<unknown>;
    flush(): Promise<SyncStatus>;
    status(): Promise<SyncStatus>;
  };
  locks: {
    list(): Promise<LockDevice[]>;
    encode(opts: EncodeRequest): Promise<EncodeResult>;
    link(channel: LockChannels): Promise<void>;
  };
}

export type SyncAction =
  'checkin' | 'checkout' | 'roomKeyGenerate' | 'posOrder' | 'folioTransfer' | 'maintenanceOrder';
export interface SyncStatus {
  queued: number;
  online: boolean;
  oldest: number | null;
}
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

declare global {
  interface Window {
    hotelia?: HoteliaBridge;
  }
}
