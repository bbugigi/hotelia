import { useState } from 'react';
import { enqueueCritical } from '../offline/queue';
import type { EncodeResult, LockDevice } from '../types';

const ROOMS = ['101', '102', '103', '201', '202', '203', '301', '302'];

export function FrontDesk() {
  const [guest, setGuest] = useState('');
  const [lastName, setLastName] = useState('');
  const [room, setRoom] = useState(ROOMS[0]);
  const [device, setDevice] = useState('LDOOR-01');
  const [lockDevices, setLockDevices] = useState<LockDevice[]>([]);
  const [encodeResult, setEncodeResult] = useState<EncodeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const listLocks = async () => {
    if (!window.hotelia) return;
    setLockDevices(await window.hotelia.locks.list());
  };

  const checkIn = async () => {
    setBusy(true);
    try {
      const m = await enqueueCritical('checkin', {
        guestName: `${guest} ${lastName}`.trim(),
        roomNumber: room,
        propertyId: 'boutique-harbor',
        ts: new Date().toISOString(),
      });
      const key = await enqueueCritical('roomKeyGenerate', {
        deviceId: device,
        roomNumber: room,
        credential: `KEY-${room}-${lastName.toUpperCase()}`,
      });
      if (window.hotelia) {
        const res = await window.hotelia.locks.encode({
          deviceId: device,
          roomNumber: room,
          credential: `KEY-${room}-${lastName.toUpperCase()}`,
        });
        setEncodeResult(res);
      }
      alert(`Queued offline (#${m.id.slice(0, 8)}). Key: ${key.id.slice(0, 8)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Front Desk</h1>
      <p className="muted">
        Critical actions are written to the local queue first, so a Wi-Fi drop never blocks a
        check-in (loophole #1).
      </p>
      <div className="grid2">
        <fieldset>
          <legend>Guest Check-in</legend>
          <label>
            First name <input value={guest} onChange={(e) => setGuest(e.target.value)} />
          </label>
          <label>
            Last name <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label>
            Room
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              {ROOMS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Room Key Encoder</legend>
          <label>
            Encoder device
            <select value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="LDOOR-01">LDOOR-01 (Lobby, TCP:9100)</option>
              <option value="LDOOR-02">LDOOR-02 (Lobby, TCP:9100)</option>
            </select>
          </label>
          <label>Credential</label>
          <code className="keybox">
            KEY-{room}-{lastName.toUpperCase() || 'LASTNAME'}
          </code>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => void checkIn()}>
              Check-in + encode key
            </button>
            <button onClick={() => void listLocks()}>Scan LAN encoders</button>
          </div>
          {encodeResult && (
            <p className={`result ${encodeResult.status}`}>
              Encoder: {encodeResult.status} · {encodeResult.ts}
            </p>
          )}
          {lockDevices.length > 0 && (
            <p className="muted">{lockDevices.map((d) => `${d.id}@${d.endpoint}`).join(', ')}</p>
          )}
        </fieldset>
      </div>
    </div>
  );
}
