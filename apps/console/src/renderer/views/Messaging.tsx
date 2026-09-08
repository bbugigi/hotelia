import { useAppStore } from '../app-store';

/**
 * Messaging — department-to-department communication (stub view).
 * In production, this connects to a message queue or WebSocket relay.
 */
export function Messaging() {
  return (
    <div>
      <h1>Messaging</h1>
      <p className="muted">
        Department-to-department messaging. Front desk ↔ housekeeping ↔ kitchen ↔ maintenance.
      </p>
      <div className="placeholder-box">
        <p className="muted">Messaging is available when the full PMS stack is deployed.</p>
        <p className="muted small">Current view: {useAppStore().view}</p>
      </div>
    </div>
  );
}
