import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { OfflineSyncEngine, type SyncEnvelope } from './offline/sync';
import { LockBridgeController, LockChannels } from './hardware/lockBridge';
import { startLocalServer } from './server';

let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_URL);

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Hotelia Console',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_URL as string);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const syncEngine = new OfflineSyncEngine();
  void syncEngine.start();

  const lockBridge = new LockBridgeController();

  startLocalServer();

  ipcMain.handle('sync:enqueue', async (_e, payload: SyncEnvelope) => {
    return syncEngine.enqueue(payload.action, payload.payload);
  });
  ipcMain.handle('sync:flush', async () => syncEngine.flush());
  ipcMain.handle('sync:status', () => syncEngine.status());

  ipcMain.handle('lock:list', () => lockBridge.list());
  ipcMain.handle(
    'lock:encode',
    (_e, opts: { deviceId: string; roomNumber: string; credential: string }) =>
      lockBridge.encode(opts),
  );
  ipcMain.handle('lock:link', (_e, channel: LockChannels) => lockBridge.attach(channel));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
