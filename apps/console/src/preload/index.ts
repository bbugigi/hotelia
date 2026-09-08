import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CommandResult } from '../main/ipcWrap';
import type { OfflineActionRecord } from '../main/offline/store';
import type { MpesaLedgerSummary, PaymentLedgerRow } from '../main/offline/store';
import type { SyncStatus } from '../main/offline/sync';
import type {
  EncodeRequest,
  EncodeResult,
  LockChannels,
  LockDevice,
} from '../main/hardware/lockBridge';
import type {
  FrontDeskBoard,
  HousekeepingTask,
  PosChargeResult,
  PosVerification,
} from '../main/pms';
import type {
  PaymentConfirmationInput,
  PaymentMatchInput,
  PaymentMethod,
  PaymentRecordInput,
  SyncEnqueueInput,
  LockEncodeInput,
  LockLinkInput,
  PosVerifyInput,
  PosChargeInput,
} from '@hotelia/shared';

/**
 * Preload bridge (contextIsolation ON, sandbox ON).
 *
 * Security posture:
 *  - Only a hand-picked, frozen surface is exposed — `Object.freeze` at every
 *    nesting level so the renderer CANNOT reassign or prototype-pollute the
 *    bridge (prototype pollution of `window.hotelia` is the classic vector
 *    for hijacking a local privileged channel).
 *  - Every IPC invoke payload is validated in the MAIN process against the
 *    shared Zod schemas before it touches a store, database or socket.
 *  - `sync:updated` is the ONLY main→renderer push channel; it carries a
 *    plain `SyncStatus` snapshot the renderer merely renders.
 */

export interface ConsoleBridge {
  readonly version: string;
  readonly sync: {
    enqueue(input: SyncEnqueueInput): Promise<CommandResult<OfflineActionRecord>>;
    status(): Promise<CommandResult<SyncStatus>>;
    recent(): Promise<CommandResult<OfflineActionRecord[]>>;
    subscribe(on: (status: SyncStatus) => void): () => void;
  };
  readonly locks: {
    list(): Promise<CommandResult<LockDevice[]>>;
    encode(opts: LockEncodeInput): Promise<CommandResult<EncodeResult>>;
    link(
      opts: LockLinkInput,
    ): Promise<CommandResult<{ linked: LockChannels; endpoint: string | null }>>;
  };
  readonly pms: {
    board(propertyId: string): Promise<CommandResult<FrontDeskBoard>>;
  };
  readonly housekeeping: {
    tasks(propertyId: string): Promise<CommandResult<HousekeepingTask[]>>;
  };
  readonly pos: {
    verify(input: PosVerifyInput): Promise<CommandResult<PosVerification>>;
    postCharge(input: PosChargeInput): Promise<CommandResult<PosChargeResult>>;
  };
  readonly conf: {
    get(): Promise<
      CommandResult<{
        server: { url: string; port: number; token: string };
        db: { available: boolean };
        propertyId: string | null;
        currency: string;
      }>
    >;
  };
  readonly win: {
    control(
      action: 'minimize' | 'toggle-maximize' | 'close',
    ): Promise<CommandResult<{ action: string }>>;
    subscribeMaximized(on: (maximized: boolean) => void): () => void;
  };
  readonly payments: {
    recordIntent(input: PaymentRecordInput): Promise<CommandResult<PaymentLedgerRow>>;
    recordConfirmation(input: PaymentConfirmationInput): Promise<CommandResult<PaymentLedgerRow>>;
    match(input: PaymentMatchInput): Promise<CommandResult<PaymentLedgerRow | null>>;
    list(): Promise<CommandResult<PaymentLedgerRow[]>>;
    summary(): Promise<CommandResult<MpesaLedgerSummary>>;
  };
}

function subscribeToSync(on: (status: SyncStatus) => void): () => void {
  const listener = (_e: IpcRendererEvent, status: SyncStatus): void => on(status);
  ipcRenderer.on('sync:updated', listener);
  return () => ipcRenderer.removeListener('sync:updated', listener);
}

function subscribeToMaximized(on: (maximized: boolean) => void): () => void {
  const listener = (_e: IpcRendererEvent, maximized: boolean): void => on(maximized);
  ipcRenderer.on('win:maximized', listener);
  return () => ipcRenderer.removeListener('win:maximized', listener);
}

export const bridge: ConsoleBridge = Object.freeze({
  version: '0.1.0',
  sync: Object.freeze({
    enqueue: (input: SyncEnqueueInput) => ipcRenderer.invoke('sync:enqueue', input),
    status: () => ipcRenderer.invoke('sync:status', undefined),
    recent: () => ipcRenderer.invoke('sync:recent', undefined),
    subscribe: subscribeToSync,
  }),
  locks: Object.freeze({
    list: () => ipcRenderer.invoke('lock:list', undefined),
    encode: (opts: LockEncodeInput) => ipcRenderer.invoke('lock:encode', opts),
    link: (opts: LockLinkInput) => ipcRenderer.invoke('lock:link', opts),
  }),
  pms: Object.freeze({
    board: (propertyId: string) => ipcRenderer.invoke('pms:board', { propertyId }),
  }),
  housekeeping: Object.freeze({
    tasks: (propertyId: string) => ipcRenderer.invoke('housekeeping:tasks', { propertyId }),
  }),
  pos: Object.freeze({
    verify: (input: PosVerifyInput) => ipcRenderer.invoke('pos:verify', input),
    postCharge: (input: PosChargeInput) => ipcRenderer.invoke('pos:postCharge', input),
  }),
  conf: Object.freeze({
    get: () => ipcRenderer.invoke('conf:get', undefined),
  }),
  win: Object.freeze({
    control: (action: 'minimize' | 'toggle-maximize' | 'close') =>
      ipcRenderer.invoke('win:control', { action }),
    subscribeMaximized: subscribeToMaximized,
  }),
  payments: Object.freeze({
    recordIntent: (input: PaymentRecordInput) => ipcRenderer.invoke('payments:recordIntent', input),
    recordConfirmation: (input: PaymentConfirmationInput) =>
      ipcRenderer.invoke('payments:recordConfirmation', input),
    match: (input: PaymentMatchInput) => ipcRenderer.invoke('payments:match', input),
    list: () => ipcRenderer.invoke('payments:list', undefined),
    summary: () => ipcRenderer.invoke('payments:summary', undefined),
  }),
});

contextBridge.exposeInMainWorld('hotelia', bridge);

// Re-export the shared shapes as types for the renderer so it stays in sync
// with the main process without importing any runtime module.
export type {
  CommandResult,
  SyncStatus,
  OfflineActionRecord,
  EncodeRequest,
  EncodeResult,
  LockDevice,
  LockChannels,
  FrontDeskBoard,
  HousekeepingTask,
  PosVerification,
  PosChargeResult,
  PaymentLedgerRow,
  MpesaLedgerSummary,
};
