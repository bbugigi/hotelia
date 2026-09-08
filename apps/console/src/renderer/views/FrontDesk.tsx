import { useCallback, useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { enqueueCritical, unwrap, requireBridge } from '../offline/sync-client';
import type { EncodeResult, FrontDeskBoard, FrontDeskRoom, LockDevice } from '../types';

const ROOM_NUMBERS = ['101', '102', '103', '201', '202', '203', '301', '302'];
const PROPERTY_MISSING =
  'Not connected to a property database — set HOTELIA_PROPERTY_ID so the board reads live from Prisma.';

function statusPillClass(status: string): string {
  if (status.startsWith('OCCUPIED')) return 'pill occupied';
  if (status.startsWith('VACANT_CLEAN') || status.startsWith('VACANT_INSPECTED'))
    return 'pill clean';
  if (status.startsWith('VACANT_DIRTY')) return 'pill dirty';
  return 'pill ooo';
}

function statusLabel(status: string): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

export function FrontDesk({ config }: { config: ConsoleConfig | null }) {
  const propertyId = config?.propertyId ?? null;
  const dbAvailable = Boolean(config?.dbAvailable);

  const [guest, setGuest] = useState('');
  const [lastName, setLastName] = useState('');
  const [room, setRoom] = useState(ROOM_NUMBERS[0]);
  const [device, setDevice] = useState('LDOOR-01');
  const [lockDevices, setLockDevices] = useState<LockDevice[]>([]);
  const [encodeResult, setEncodeResult] = useState<EncodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<FrontDeskBoard | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    if (!propertyId || !window.hotelia) return;
    try {
      const b = await unwrap(requireBridge().pms.board(propertyId));
      setBoard(b);
      setBoardError(null);
      if (b.rooms.length > 0 && !b.rooms.some((r) => r.number === room)) {
        setRoom(b.rooms[0].number);
      }
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : String(err));
    }
  }, [propertyId, room]);

  useEffect(() => {
    void refreshBoard();
    if (!window.hotelia) return;
    void unwrap(requireBridge().locks.list())
      .then(setLockDevices)
      .catch(() => undefined);
  }, [refreshBoard]);

  const checkIn = async () => {
    setBusy(true);
    try {
      const m = await enqueueCritical('checkin', {
        guestName: `${guest} ${lastName}`.trim(),
        roomNumber: room,
        propertyId,
        ts: new Date().toISOString(),
      });
      const key = await enqueueCritical('roomKeyGenerate', {
        deviceId: device,
        roomNumber: room,
        credential: `KEY-${room}-${lastName.toUpperCase()}`,
      });
      if (window.hotelia) {
        const res = await unwrap(
          requireBridge().locks.encode({
            deviceId: device,
            roomNumber: room,
            credential: `KEY-${room}-${lastName.toUpperCase()}`,
          }),
        );
        setEncodeResult(res);
      }
      alert(`Queued offline (#${m.id.slice(0, 8)}). Key: ${key.id.slice(0, 8)}`);
    } catch (err) {
      alert(`Check-in failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Front Desk</h1>
      <p className="muted">
        Live room board from the local Prisma database. Critical actions are written to the single
        SQLite offline queue first — a Wi-Fi drop never blocks a check-in.
      </p>

      {dbAvailable && propertyId && boardError && (
        <p className="result error">Board unavailable: {boardError}</p>
      )}
      {dbAvailable && !propertyId && <p className="result error">{PROPERTY_MISSING}</p>}
      {!dbAvailable && (
        <p className="result error">Database not provisioned — showing offline essentials only.</p>
      )}

      <div className="room-grid">
        {(board?.rooms ?? []).map((r: FrontDeskRoom) => (
          <div
            key={r.id}
            className={`room-tile ${r.status.startsWith('OCCUPIED') ? 'occupied' : ''}`}
          >
            <div className="room-tile-top">
              <strong>{r.number}</strong>
              <span className={statusPillClass(r.status)}>{statusLabel(r.status)}</span>
            </div>
            <div className="muted small">
              {r.floor ? `F${r.floor} · ` : ''}
              {r.type.toLowerCase()}
            </div>
            {r.occupancy.length > 0 && (
              <div className="small">
                {r.occupancy.map((o) => `${o.firstName} ${o.lastName}`).join(', ')}
              </div>
            )}
            {r.balance && <div className="small">● ${r.balance}</div>}
          </div>
        ))}
        {(!board || board.rooms.length === 0) && (
          <p className="muted full">No rooms loaded from DB yet.</p>
        )}
      </div>

      <div className="grid2">
        <fieldset>
          <legend>Arrivals today</legend>
          {(board?.arrivals ?? []).length === 0 ? (
            <p className="muted small">—</p>
          ) : (
            (board?.arrivals ?? []).map((r) => (
              <div key={r.id} className="row between">
                <span>
                  <strong>{r.guest.lastName}</strong>, {r.guest.firstName}
                </span>
                <span className="muted small">
                  {r.roomNumber ?? 'unassigned'} · #{r.confirmationNo}
                </span>
              </div>
            ))
          )}
        </fieldset>
        <fieldset>
          <legend>Departures today</legend>
          {(board?.departures ?? []).length === 0 ? (
            <p className="muted small">—</p>
          ) : (
            (board?.departures ?? []).map((r) => (
              <div key={r.id} className="row between">
                <span>
                  <strong>{r.guest.lastName}</strong>, {r.guest.firstName}
                </span>
                <span className="muted small">{r.roomNumber ?? 'unassigned'}</span>
              </div>
            ))
          )}
        </fieldset>
      </div>

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
              {(board?.rooms.map((r) => r.number) ?? ROOM_NUMBERS).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Room Key Encoder</legend>
          <label>
            Encoder device
            <select value={device} onChange={(e) => setDevice(e.target.value)}>
              {lockDevices.length > 0 ? (
                lockDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} ({d.channel}:{d.endpoint})
                  </option>
                ))
              ) : (
                <>
                  <option value="LDOOR-01">LDOOR-01 (Lobby, TCP:9100)</option>
                  <option value="LDOOR-02">LDOOR-02 (Lobby, TCP:9100)</option>
                </>
              )}
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
            <button onClick={() => void refreshBoard()}>Refresh board</button>
          </div>
          {encodeResult && (
            <p className={`result ${encodeResult.status}`}>
              Encoder: {encodeResult.status}
              {encodeResult.queuedId
                ? ` · queued #${encodeResult.queuedId.slice(0, 8)}`
                : ''} · {encodeResult.ts}
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
