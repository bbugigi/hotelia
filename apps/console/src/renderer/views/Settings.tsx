import { useEffect, useState } from 'react';
import type { LockDevice } from '../types';

export function Settings() {
  const [locks, setLocks] = useState<LockDevice[]>([]);
  const [linked, setLinked] = useState('');

  useEffect(() => {
    if (!window.hotelia) return;
    void window.hotelia.locks.list().then(setLocks);
  }, []);

  return (
    <div>
      <h1>Settings</h1>
      <div className="grid2">
        <fieldset>
          <legend>Local backend</legend>
          <p className="muted">
            REST + SSE broker: <code>http://localhost:3110</code>
          </p>
        </fieldset>
        <fieldset>
          <legend>Lock encoders (LAN bridge)</legend>
          <p className="muted">
            Link a TCP bridge, e.g. <code>lock:tcp:192.168.1.20:9100</code>
          </p>
          <label>
            Bridge endpoint{' '}
            <input
              value={linked}
              onChange={(e) => setLinked(e.target.value)}
              placeholder="tcp:192.168.1.20:9100"
            />
          </label>
          <button onClick={() => void window.hotelia?.locks.link('tcp')}>Link TCP</button>
          <pre className="box">{JSON.stringify(locks, null, 2) || 'No devices discovered yet'}</pre>
        </fieldset>
      </div>
    </div>
  );
}
