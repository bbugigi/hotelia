import { useCallback, useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { unwrap, requireBridge } from '../offline/sync-client';
import { appStore } from '../app-store';
import type { HousekeepingTask } from '../types';

/**
 * Housekeeping — live room cleaning and inspection tasks.
 * Task-board view grouped by status, driven by the read-only cache.
 */

const GROUPS = [
  ['VACANT_DIRTY', 'Dirty'],
  ['VACANT_CLEAN', 'Clean'],
  ['INSPECTED', 'Inspected'],
  ['OOO', 'Out of order'],
] as const;

export function Housekeeping({ config }: { config: ConsoleConfig | null }) {
  const propertyId = config?.propertyId ?? null;
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!propertyId || !window.hotelia) return;
    setLoading(true);
    try {
      const res = await unwrap(requireBridge().housekeeping.tasks(propertyId));
      setTasks(res);
      appStore.setTasks(res);
    } catch (err) {
      setTasks([]);
      void appStore;
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byStatus = useCallback(
    (status: string) =>
      tasks.filter(
        (t) =>
          t.status === status ||
          (status === 'INSPECTED' && t.status === 'VACANT_INSPECTED') ||
          (status === 'OOO' && t.status.startsWith('OOO')),
      ),
    [tasks],
  );

  return (
    <div>
      <h1>Housekeeping</h1>
      <p className="muted">
        Room cleaning status live from the local database. Open work orders are surfaced per room.
      </p>
      <button className="muted" onClick={() => void refresh()} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      <div className="task-board">
        {GROUPS.map(([status, label]) => {
          const items = byStatus(status);
          return (
            <div key={status} className="task-column">
              <h3 className="task-column-title">
                {label} <span className="muted">{items.length}</span>
              </h3>
              {items.length === 0 && <p className="muted small">—</p>}
              {items.map((t) => (
                <div key={t.roomId} className="task-card">
                  <div className="task-card-head">
                    <strong>Room {t.roomNumber}</strong>
                  </div>
                  <div className="small muted">
                    Departure today: {t.hasDeparture ? 'yes' : 'no'} · Work orders:{' '}
                    {t.openWorkOrders}
                  </div>
                  {t.workOrderSubjects.length > 0 && (
                    <div className="small">{t.workOrderSubjects.join(' · ')}</div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
