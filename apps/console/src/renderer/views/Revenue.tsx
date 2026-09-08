import type { ConsoleConfig } from '../App';
import { useAppStore } from '../app-store';

/**
 * Revenue — daily/monthly revenue dashboards and KPIs.
 * Reads from the local database and syncs with PMS when online.
 */

export function Revenue({ config }: { config: ConsoleConfig | null }) {
  const currency = config?.currency ?? 'KES';
  const board = useAppStore().board;
  const occupied = board?.rooms.filter((r) => r.status.startsWith('OCCUPIED')).length ?? 0;
  const totalRooms = board?.rooms.length ?? 0;
  const occupancyRate = totalRooms > 0 ? ((occupied / totalRooms) * 100).toFixed(1) : '0.0';

  return (
    <div>
      <h1>Revenue</h1>
      <p className="muted">
        Daily revenue dashboards and KPIs — occupancy, ADR, RevPAR, and department breakdowns.
      </p>
      <div className="revenue-kpis">
        <div className="chip">
          <span className="chip-value">
            {occupied}/{totalRooms}
          </span>
          <span className="chip-label">Rooms occupied</span>
        </div>
        <div className="chip">
          <span className="chip-value">{occupancyRate}%</span>
          <span className="chip-label">Occupancy rate</span>
        </div>
        <div className="chip">
          <span className="chip-value">{currency}</span>
          <span className="chip-label">Currency</span>
        </div>
      </div>
      <div className="placeholder-box">
        <p className="muted">
          Full revenue analytics (ADR, RevPAR, department breakdowns, export) will be available when
          the Prisma/Postgres backend is provisioned.
        </p>
      </div>
    </div>
  );
}
