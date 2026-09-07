import { contextBridge, ipcRenderer } from 'electron';
import type {
  EncodeRequest,
  EncodeResult,
  LockChannels,
  LockDevice,
} from '../main/hardware/lockBridge';
import type { SyncAction, SyncStatus } from '../main/offline/sync';

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

const bridge: HoteliaBridge = {
  sync: {
    enqueue: (action, payload) =>
      ipcRenderer.invoke('sync:enqueue', { id: crypto.randomUUID(), action, payload }),
    flush: () => ipcRenderer.invoke('sync:flush'),
    status: () => ipcRenderer.invoke('sync:status'),
  },
  locks: {
    list: () => ipcRenderer.invoke('lock:list'),
    encode: (opts) => ipcRenderer.invoke('lock:encode', opts),
    link: (channel) => ipcRenderer.invoke('lock:link', channel),
  },
};

contextBridge.exposeInMainWorld('hotelia', bridge);
