import { useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { unwrap, requireBridge } from '../offline/sync-client';
import type { LockDevice } from '../types';

export function Settings({ config }: { config: ConsoleConfig | null }) {
  const [locks, setLocks] = useState<LockDevice[]>([]);
  const [endpoint, setEndpoint] = useState('127.0.0.1:9100');
  const [linkMsg, setLinkMsg] = useState('');

  useEffect(() => {
    if (!window.hotelia) return;
    void unwrap(requireBridge().locks.list())
      .then(setLocks)
      .catch(() => undefined);
  }, []);

  const link = async () => {
    if (!window.hotelia) return;
    try {
      const res = await unwrap(requireBridge().locks.link({ channel: 'tcp', endpoint }));
      setLinkMsg(`Linked TCP encoder at ${String(res)}`);
    } catch (err) {
      setLinkMsg(err instanceof Error ? err.message : 'link failed');
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      <div className="grid2">
        <fieldset>
          <legend>Local backend</legend>
          <p className="muted">
            REST + SSE broker: <code>{config?.serverUrl ?? 'http://127.0.0.1:3110'}</code>
          </p>
          <p className="muted small">
            Database: {config?.dbAvailable ? 'provisioned (Prisma)' : 'not provisioned'}
          </p>
          <label>
            Device token (set on KDS / Guest PWA install)
            <input readOnly value={config?.serverToken ?? ''} onFocus={(e) => e.target.select()} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Lock encoders (LAN bridge)</legend>
          <p className="muted small">
            Encoder encodes are bounded by a 5 s timeout and a circuit breaker; failures are durably
            queued in SQLite and retried in the background — the IPC call never hangs.
          </p>
          <label>
            Bridge endpoint{' '}
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="192.168.1.20:9100"
            />
          </label>
          <button onClick={() => void link()}>Link TCP</button>
          {linkMsg && <p className="muted small">{linkMsg}</p>}
          <pre className="box">{JSON.stringify(locks, null, 2) || 'No devices discovered yet'}</pre>
          <p className="muted small">
            Set <code>HOTELIA_LOCK_ENDPOINT</code> before launch to configure the lobby encoder
            hosts; LDOOR-01 / LDOOR-02 are seeded automatically.
          </p>
        </fieldset>
      </div>
    </div>
  );
}
