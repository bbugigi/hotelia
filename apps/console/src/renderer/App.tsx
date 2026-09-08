import { useEffect, useState } from 'react';
import { FrontDesk } from './views/FrontDesk';
import { Housekeeping } from './views/Housekeeping';
import { Pos } from './views/Pos';
import { Messaging } from './views/Messaging';
import { WorkOrders } from './views/WorkOrders';
import { Revenue } from './views/Revenue';
import { Settings } from './views/Settings';
import { readSyncStatus, subscribeSyncStatus, unwrap, requireBridge } from './offline/sync-client';
import type { SyncStatus } from './types';

export type ViewKey =
  'frontdesk' | 'housekeeping' | 'pos' | 'messaging' | 'workorders' | 'revenue' | 'settings';

const NAV: Array<{ key: ViewKey; label: string }> = [
  { key: 'frontdesk', label: 'Front Desk' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'pos', label: 'POS' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'workorders', label: 'Work Orders' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'settings', label: 'Settings' },
];

export interface ConsoleConfig {
  propertyId: string | null;
  dbAvailable: boolean;
  serverUrl: string;
  serverToken: string;
}

export function App() {
  const [view, setView] = useState<ViewKey>('frontdesk');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [config, setConfig] = useState<ConsoleConfig | null>(null);

  // Authored config is pulled once from main (env-orchestrated); the status
  // badge is live through the pushed `sync:updated` channel (no polling).
  useEffect(() => {
    let unsub: () => void = () => undefined;
    void readSyncStatus().then(setStatus);
    void (async () => {
      if (!window.hotelia) return;
      const conf = await unwrap(requireBridge().conf.get());
      setConfig({
        propertyId: conf.propertyId ?? null,
        dbAvailable: conf.db.available,
        serverUrl: conf.server.url,
        serverToken: conf.server.token,
      });
    })().catch(() => undefined);
    unsub = subscribeSyncStatus(setStatus);
    return () => unsub();
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">H</span>
          <span>Hotelia</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${view === n.key ? 'active' : ''}`}
              onClick={() => setView(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div
          className={`sync-badge ${status?.online ? 'online' : 'offline'}`}
          title="Offline sync queue status (SQLite, single writer)"
        >
          {status?.online ? '● Online' : `● Offline · ${status?.queued ?? 0} queued`}
        </div>
      </aside>
      <main className="content">
        {view === 'frontdesk' && <FrontDesk config={config} />}
        {view === 'housekeeping' && <Housekeeping config={config} />}
        {view === 'pos' && <Pos config={config} />}
        {view === 'messaging' && <Messaging />}
        {view === 'workorders' && <WorkOrders />}
        {view === 'revenue' && <Revenue />}
        {view === 'settings' && <Settings config={config} />}
      </main>
    </div>
  );
}
