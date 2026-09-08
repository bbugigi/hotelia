import { useCallback, useEffect, useRef, useState } from 'react';
import { FrontDesk } from './views/FrontDesk';
import { Housekeeping } from './views/Housekeeping';
import { Pos } from './views/Pos';
import { Messaging } from './views/Messaging';
import { WorkOrders } from './views/WorkOrders';
import { Revenue } from './views/Revenue';
import { Reconciliation } from './views/Reconciliation';
import { Settings } from './views/Settings';
import { readSyncStatus, subscribeSyncStatus, unwrap, requireBridge } from './offline/sync-client';
import { appStore, useAppStore } from './app-store';
import { Palette, usePaletteCommands } from './palette';
import { ToastProvider, useToast } from './toast';
import { cn } from './utils';
import { useShortcuts } from './use-shortcuts';
import {
  IconFrontDesk,
  IconHousekeeping,
  IconLedger,
  IconPos,
  IconMessaging,
  IconWorkOrders,
  IconRevenue,
  IconSettings,
  IconSearch,
  IconMark,
  IconMinimize,
  IconMaximize,
  IconRestore,
  IconClose,
} from './icons';
import type { SyncStatus } from './types';
import type { ReactNode } from 'react';

export type ViewKey =
  | 'frontdesk'
  | 'housekeeping'
  | 'pos'
  | 'messaging'
  | 'workorders'
  | 'revenue'
  | 'reconciliation'
  | 'settings';

const NAV: Array<{
  key: ViewKey;
  label: string;
  Icon: (p: { size?: number }) => ReactNode;
  badge?: (s: SyncStatus | null, board: ReturnType<typeof useAppStore>['board']) => number | null;
}> = [
  {
    key: 'frontdesk',
    label: 'Front Desk',
    Icon: IconFrontDesk,
    badge: (_s, b) => (b?.rooms.length ?? 0) || null,
  },
  {
    key: 'housekeeping',
    label: 'Housekeeping',
    Icon: IconHousekeeping,
    badge: (_s, b) => (b?.rooms.filter((r) => r.status === 'VACANT_DIRTY').length ?? 0) || null,
  },
  { key: 'pos', label: 'POS', Icon: IconPos },
  { key: 'messaging', label: 'Messaging', Icon: IconMessaging },
  { key: 'workorders', label: 'Work Orders', Icon: IconWorkOrders },
  { key: 'revenue', label: 'Revenue', Icon: IconRevenue },
  { key: 'reconciliation', label: 'Reconciliation', Icon: IconLedger },
  { key: 'settings', label: 'Settings', Icon: IconSettings },
];

export interface ConsoleConfig {
  propertyId: string | null;
  dbAvailable: boolean;
  serverUrl: string;
  serverToken: string;
  currency: string;
}

function TitleBar({ onOpenPalette }: { onOpenPalette(): void }) {
  const { status, config } = useAppStore();
  const [maximized, setMaximized] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!window.hotelia) return;
    return window.hotelia.win.subscribeMaximized(setMaximized);
  }, []);

  const win = useCallback(
    (action: 'minimize' | 'toggle-maximize' | 'close') => {
      void window.hotelia?.win.control(action).catch(() => {
        toast.push({ kind: 'error', title: 'Window control unavailable' });
      });
    },
    [toast],
  );

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-mark">
          <IconMark size={16} />
        </span>
        <span className="titlebar-name">Hotelia</span>
        {config?.propertyId && (
          <span className="titlebar-property">{config.propertyId.slice(0, 8)}</span>
        )}
      </div>
      <div className="titlebar-center">
        <button
          className="titlebar-search"
          onClick={onOpenPalette}
          title="Search commands (Ctrl+K)"
        >
          <IconSearch size={16} />
          <span>Search</span>
          <kbd className="kbd">⌘K</kbd>
        </button>
      </div>
      <div className="titlebar-right">
        <span
          className={cn('sync-chip', status?.online ? 'online' : 'offline')}
          title="Live sync status"
        >
          <span className="sync-dot" />
          {status?.online ? 'Online' : `${status?.queued ?? 0} queued`}
        </span>
        <button className="win-btn" onClick={() => win('minimize')} title="Minimize">
          <IconMinimize size={14} />
        </button>
        <button className="win-btn" onClick={() => win('toggle-maximize')} title="Maximize">
          {maximized ? <IconRestore size={14} /> : <IconMaximize size={14} />}
        </button>
        <button className="win-btn win-btn-close" onClick={() => win('close')} title="Close">
          <IconClose size={14} />
        </button>
      </div>
    </header>
  );
}

function Shell() {
  const state = useAppStore();
  const toast = useToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef(() => setPaletteOpen((v) => !v));
  paletteRef.current = () => setPaletteOpen((v) => !v);
  const commands = usePaletteCommands();

  // Config / sync init
  useEffect(() => {
    void readSyncStatus().then(appStore.setStatus);
    void (async () => {
      if (!window.hotelia) return;
      const conf = await unwrap(requireBridge().conf.get());
      appStore.setConfig({
        propertyId: conf.propertyId ?? null,
        dbAvailable: conf.db.available,
        serverUrl: conf.server.url,
        serverToken: conf.server.token,
        currency: conf.currency,
      });
    })().catch(() => undefined);
    const unsub = subscribeSyncStatus(appStore.setStatus);
    return () => unsub();
  }, []);

  useShortcuts(paletteRef.current);

  const occupied = state.board?.rooms.filter((r) => r.status.startsWith('OCCUPIED')).length ?? 0;
  const dirty = state.board?.rooms.filter((r) => r.status === 'VACANT_DIRTY').length ?? 0;

  return (
    <div className="shell">
      <TitleBar onOpenPalette={paletteRef.current} />
      <div className="shell-body">
        <aside className="sidebar">
          <nav>
            {NAV.map((n, i) => {
              const count = n.badge?.(state.status, state.board) ?? null;
              return (
                <button
                  key={n.key}
                  className={cn('nav-item', state.view === n.key && 'active')}
                  onClick={() => appStore.navigate(n.key)}
                  title={`${n.label}${count ? ` (${count})` : ''}`}
                  accessKey={String(i + 1)}
                >
                  <n.Icon size={18} />
                  <span className="nav-label">{n.label}</span>
                  {count !== null && count > 0 && <span className="nav-badge">{count}</span>}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-stats">
            <span title="Rooms occupied">
              <span className="stat-dot occupied" />
              {occupied} occupied
            </span>
            <span title="Dirty rooms">
              <span className="stat-dot dirty" />
              {dirty} dirty
            </span>
          </div>
        </aside>
        <main className="content">
          {state.view === 'frontdesk' && <FrontDesk config={state.config} />}
          {state.view === 'housekeeping' && <Housekeeping config={state.config} />}
          {state.view === 'pos' && <Pos config={state.config} />}
          {state.view === 'messaging' && <Messaging />}
          {state.view === 'workorders' && <WorkOrders />}
          {state.view === 'revenue' && <Revenue config={state.config} />}
          {state.view === 'reconciliation' && <Reconciliation config={state.config} />}
          {state.view === 'settings' && <Settings config={state.config} />}
        </main>
      </div>
      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpen={paletteRef.current}
        commands={commands}
      />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
