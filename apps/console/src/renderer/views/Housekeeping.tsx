import { useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { unwrap, requireBridge } from '../offline/sync-client';
import type { HousekeepingTask } from '../types';

function pillClass(status: string): string {
  if (status.startsWith('OCCUPIED')) return 'pill occupied';
  if (status.startsWith('VACANT_CLEAN') || status.startsWith('VACANT_INSPECTED'))
    return 'pill clean';
  if (status.startsWith('VACANT_DIRTY')) return 'pill dirty';
  return 'pill ooo';
}

function statusLabel(status: string): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

export function Housekeeping({ config }: { config: ConsoleConfig | null }) {
  const propertyId = config?.propertyId ?? null;

  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setError('Set HOTELIA_PROPERTY_ID to load housekeeping from the property database.');
      return;
    }
    if (!window.hotelia) return;
    void unwrap(requireBridge().housekeeping.tasks(propertyId))
      .then((rows) => {
        setTasks(rows);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [propertyId]);

  return (
    <div>
      <h1>Housekeeping</h1>
      <p className="muted">
        Live room status from Prisma: each row reflects the current Room status, today's departures
        and open work-orders for that room.
      </p>

      {error && <p className="result error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Room</th>
            <th>Status</th>
            <th>Departure today</th>
            <th>Open work orders</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.roomId}>
              <td>{t.roomNumber}</td>
              <td>
                <span className={pillClass(t.status)}>{statusLabel(t.status)}</span>
              </td>
              <td>{t.hasDeparture ? 'Yes' : '—'}</td>
              <td>
                {t.openWorkOrders > 0
                  ? `${t.openWorkOrders} · ${t.workOrderSubjects.join(', ')}`
                  : '—'}
              </td>
            </tr>
          ))}
          {tasks.length === 0 && !error && (
            <tr>
              <td colSpan={4} className="muted">
                No rooms loaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
