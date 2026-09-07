import { useEffect, useState } from 'react';
import { FrontDesk } from './views/FrontDesk';
import { Housekeeping } from './views/Housekeeping';
import { Pos } from './views/Pos';
import { Messaging } from './views/Messaging';
import { WorkOrders } from './views/WorkOrders';
import { Revenue } from './views/Revenue';
import { Settings } from './views/Settings';
import { syncStatus } from './offline/queue';
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

export function App() {
  const [view, setView] = useState<ViewKey>('frontdesk');
  const [status, setStatus] = useState<SyncStatus | null>(null);

  const refresh = () => {
    void syncStatus().then(setStatus);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
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
          title="Offline sync queue status"
        >
          {status?.online ? '● Online' : `● Offline · ${status?.queued ?? 0} queued`}
        </div>
      </aside>
      <main className="content">
        {view === 'frontdesk' && <FrontDesk />}
        {view === 'housekeeping' && <Housekeeping />}
        {view === 'pos' && <Pos />}
        {view === 'messaging' && <Messaging />}
        {view === 'workorders' && <WorkOrders />}
        {view === 'revenue' && <Revenue />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
