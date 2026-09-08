import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { z } from 'zod';
import {
  ipcNoArgsSchema,
  lockEncodeSchema,
  lockLinkSchema,
  paymentConfirmationSchema,
  paymentMatchSchema,
  paymentRecordSchema,
  posChargeSchema,
  posVerifySchema,
  propertyQuerySchema,
  syncEnqueueSchema,
  type LockEncodeInput,
  type LockLinkInput,
  type PaymentConfirmationInput,
  type PaymentMatchInput,
  type PaymentRecordInput,
} from '@hotelia/shared';
import { EVENT_TYPES } from '@hotelia/events';
import { OfflineActionStore } from './offline/store';
import { OfflineSyncEngine, type SyncStatus } from './offline/sync';
import { LockBridgeController } from './hardware/lockBridge';
import { bus, getServerConfig, getServerToken, startLocalServer } from './server';
import { wrapIpc } from './ipcWrap';
import { loadDbEnv, isDbAvailable } from './db';
import { frontDeskBoard, housekeepingTasks, posPostCharge, posVerifyGuest } from './pms';
import { logger } from './logger';

let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_URL);

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Hotelia Console',
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_URL as string);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('maximize', () => broadcast('win:maximized', true));
  mainWindow.on('unmaximize', () => broadcast('win:maximized', false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerWindowIpc(): void {
  const winControlSchema = z.object({
    action: z.enum(['minimize', 'toggle-maximize', 'close']),
  });
  ipcMain.handle(
    'win:control',
    wrapIpc(
      'win:control',
      winControlSchema,
      ({ action }: { action: 'minimize' | 'toggle-maximize' | 'close' }) => {
        const win = mainWindow ?? BrowserWindow.getFocusedWindow();
        if (!win) return { action: 'none' };
        if (action === 'minimize') win.minimize();
        if (action === 'toggle-maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
        if (action === 'close') win.close();
        return { action };
      },
    ),
  );
}

function registerIpc(bridge: {
  sync: OfflineSyncEngine;
  locks: LockBridgeController;
  store: OfflineActionStore;
}): void {
  const { sync, locks, store } = bridge;

  // ── Offline queue (single SQLite writer) ────────────────────────────────
  ipcMain.handle(
    'sync:enqueue',
    wrapIpc('sync:enqueue', syncEnqueueSchema, (input) => {
      // Sovereign write: unique key collision returns the same canonical row.
      return sync.enqueue(input);
    }),
  );
  ipcMain.handle(
    'sync:status',
    wrapIpc('sync:status', ipcNoArgsSchema, () => sync.status()),
  );
  ipcMain.handle(
    'sync:recent',
    wrapIpc('sync:recent', ipcNoArgsSchema, () => sync.recent()),
  );

  // ── Lock encoder bridge (validated, never hangs) ────────────────────────
  ipcMain.handle(
    'lock:list',
    wrapIpc('lock:list', ipcNoArgsSchema, () => locks.list()),
  );
  ipcMain.handle(
    'lock:encode',
    wrapIpc('lock:encode', lockEncodeSchema, (input: LockEncodeInput) => locks.encode(input)),
  );
  ipcMain.handle(
    'lock:link',
    wrapIpc('lock:link', lockLinkSchema, (input: LockLinkInput) => {
      locks.attach(input.channel, input.endpoint);
      return { linked: input.channel, endpoint: input.endpoint ?? null };
    }),
  );

  // ── Live DB reads (Task 5) ──────────────────────────────────────────────
  ipcMain.handle(
    'pms:board',
    wrapIpc('pms:board', propertyQuerySchema, (input) => frontDeskBoard(input.propertyId)),
  );
  ipcMain.handle(
    'housekeeping:tasks',
    wrapIpc('housekeeping:tasks', propertyQuerySchema, (input) =>
      housekeepingTasks(input.propertyId),
    ),
  );
  ipcMain.handle(
    'pos:verify',
    wrapIpc('pos:verify', posVerifySchema, (input) => posVerifyGuest(input)),
  );
  ipcMain.handle(
    'pos:postCharge',
    wrapIpc('pos:postCharge', posChargeSchema, (input) => posPostCharge(input)),
  );

  // ── Local config surface for the Settings view / KDS provisioning ───────
  ipcMain.handle(
    'conf:get',
    wrapIpc('conf:get', ipcNoArgsSchema, () => ({
      server: getServerConfig(),
      db: { available: isDbAvailable() },
      propertyId: process.env.HOTELIA_PROPERTY_ID ?? null,
      currency: process.env.HOTELIA_CURRENCY ?? 'KES',
    })),
  );

  // ── Local M-Pesa / cash reconciliation ledger (Kenya-first payments) ─────
  ipcMain.handle(
    'payments:recordIntent',
    wrapIpc('payments:recordIntent', paymentRecordSchema, (input: PaymentRecordInput) =>
      store.recordIntent(input),
    ),
  );
  ipcMain.handle(
    'payments:recordConfirmation',
    wrapIpc(
      'payments:recordConfirmation',
      paymentConfirmationSchema,
      (input: PaymentConfirmationInput) => store.recordConfirmation(input),
    ),
  );
  ipcMain.handle(
    'payments:match',
    wrapIpc('payments:match', paymentMatchSchema, (input: PaymentMatchInput) =>
      store.matchConfirmation(input.confirmationId, input.intentId, input.operatorId),
    ),
  );
  ipcMain.handle(
    'payments:list',
    wrapIpc('payments:list', ipcNoArgsSchema, () => store.listLedger()),
  );
  ipcMain.handle(
    'payments:summary',
    wrapIpc('payments:summary', ipcNoArgsSchema, () => store.ledgerSummary()),
  );
}

let syncEngine: OfflineSyncEngine | null = null;
let lockBridge: LockBridgeController | null = null;
let localServer: ReturnType<typeof startLocalServer> | null = null;

app.whenReady().then(() => {
  const log = logger.child('boot');
  loadDbEnv();

  // Single ACID store = single source of truth. Everything (check-in, POS,
  // room keys, folio transfers) funnels through here.
  const store = new OfflineActionStore();

  syncEngine = new OfflineSyncEngine(store, {
    token: getServerToken(),
    onChanged: (status: SyncStatus) => broadcast('sync:updated', status),
  });
  syncEngine.start();

  lockBridge = new LockBridgeController(store);
  // Seed the known lobby encoders so a fresh machine is immediately usable.
  const lockEndpoint = process.env.HOTELIA_LOCK_ENDPOINT ?? '127.0.0.1:9100';
  lockBridge.attach('tcp', lockEndpoint);
  for (const id of ['LDOOR-01', 'LDOOR-02']) {
    lockBridge.registerDevice({
      id,
      channel: 'tcp',
      endpoint: lockEndpoint,
      model: 'SALTO-BRIDGE',
      online: false,
    });
  }
  lockBridge.on(
    'encode-completed',
    (res: { roomNumber: string; credential: string; deviceId: string }) => {
      bus.publish(EVENT_TYPES.ROOM_KEY_GENERATED, { ...res, completed: true, queued: false });
    },
  );
  lockBridge.on(
    'offline-encode-queued',
    (res: { roomNumber: string; credential: string; deviceId: string }) => {
      bus.publish(EVENT_TYPES.ROOM_KEY_GENERATED, { ...res, completed: false, queued: true });
    },
  );

  localServer = startLocalServer({ streamToken: getServerToken() });
  log.info('all-subsystems-ready');

  registerWindowIpc();
  registerIpc({ sync: syncEngine, locks: lockBridge, store });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try {
    syncEngine?.close();
    lockBridge?.shutdown();
    localServer?.close();
  } catch (err) {
    logger.warn('before-quit:cleanup-error', undefined, err as Error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
