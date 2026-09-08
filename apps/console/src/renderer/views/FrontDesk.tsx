import { useCallback, useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { enqueueCritical, unwrap, requireBridge } from '../offline/sync-client';
import { appStore } from '../app-store';
import { useToast } from '../toast';
import { fmtCurrency, idempotencyKey } from '../utils';
import type { EncodeResult, FrontDeskRoom, LockDevice } from '../types';

const ROOM_NUMBERS = ['101', '102', '103', '201', '202', '203', '301', '302'];

function statusPill(status: string) {
  if (status.startsWith('OCCUPIED')) return 'pill occupied';
  if (status.startsWith('VACANT_CLEAN') || status.startsWith('VACANT_INSPECTED'))
    return 'pill clean';
  if (status.startsWith('VACANT_DIRTY')) return 'pill dirty';
  return 'pill ooo';
}

export function FrontDesk({ config }: { config: ConsoleConfig | null }) {
  const propertyId = config?.propertyId ?? null;
  const dbAvailable = Boolean(config?.dbAvailable);
  const currency = config?.currency ?? 'KES';
  const toast = useToast();

  const [guest, setGuest] = useState('');
  const [lastName, setLastName] = useState('');
  const [room, setRoom] = useState(ROOM_NUMBERS[0]);
  const [device, setDevice] = useState('LDOOR-01');
  const [lockDevices, setLockDevices] = useState<LockDevice[]>([]);
  const [encodeResult, setEncodeResult] = useState<EncodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [peekRoom, setPeekRoom] = useState<string | null>(null);

  const board = appStore.get().board;

  const refreshBoard = useCallback(async () => {
    if (!propertyId || !window.hotelia) return;
    try {
      const b = await unwrap(requireBridge().pms.board(propertyId));
      appStore.setBoard(b);
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

    // Listen for palette room search → select and reveal room
    const handler = (e: Event) => {
      const num = (e as CustomEvent<string>).detail;
      setRoom(num);
      setPeekRoom(num);
    };
    window.addEventListener('palette:room', handler);
    return () => window.removeEventListener('palette:room', handler);
  }, [refreshBoard]);

  // Spacebar opens peek for the currently selected room
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.isComposing || (e.target as HTMLElement).tagName !== 'BODY') return;
      e.preventDefault();
      setPeekRoom((prev) => (prev === room ? null : room));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [room]);

  const checkIn = async () => {
    setBusy(true);
    try {
      const m = await enqueueCritical('checkin', {
        guestName: `${guest} ${lastName}`.trim(),
        roomNumber: room,
        propertyId,
        ts: new Date().toISOString(),
        idempotencyKey: idempotencyKey('checkin'),
      });
      await enqueueCritical('roomKeyGenerate', {
        deviceId: device,
        roomNumber: room,
        credential: `KEY-${room}-${lastName.toUpperCase()}`,
        idempotencyKey: idempotencyKey('keygen'),
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
      toast.push({
        kind: 'success',
        title: 'Check-in queued',
        detail: `Action #${m.id.slice(0, 8)}. Room ${room} key encoded.`,
      });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Check-in failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const peekData = peekRoom ? (board?.rooms.find((r) => r.number === peekRoom) ?? null) : null;

  return (
    <div>
      <h1>Front Desk</h1>
      <p className="muted">
        Live room board from the local Prisma database. Critical actions are written to the single
        SQLite offline queue first — a Wi-Fi drop never blocks a check-in.
      </p>

      {dbAvailable && boardError && <p className="result error">Board unavailable: {boardError}</p>}
      {!dbAvailable && (
        <p className="result error">Database not provisioned — showing offline essentials only.</p>
      )}

      {peekData && (
        <div
          className="quick-peek"
          role="dialog"
          aria-label={`Room ${peekData.number} details`}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === ' ') {
              e.preventDefault();
              setPeekRoom(null);
            }
          }}
        >
          <div className="quick-peek-head">
            <strong>Room {peekData.number}</strong>
            <button onClick={() => setPeekRoom(null)}>dismiss</button>
          </div>
          <div className="muted">
            {peekData.type.toLowerCase()} &middot;{' '}
            {peekData.status.toLowerCase().replace(/_/g, ' ')}
            {peekData.floor ? ` · Floor ${peekData.floor}` : ''}
          </div>
          {peekData.occupancy.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {peekData.occupancy.map((o) => `${o.firstName} ${o.lastName}`).join(', ')}
            </div>
          )}
          {peekData.balance && (
            <div style={{ marginTop: 4 }}>{fmtCurrency(Number(peekData.balance), currency)}</div>
          )}
        </div>
      )}

      <div className="room-grid">
        {(board?.rooms ?? []).map((r: FrontDeskRoom) => (
          <button
            key={r.id}
            className={`room-tile ${r.status.startsWith('OCCUPIED') ? 'occupied' : ''} ${peekRoom === r.number ? 'peek-open' : ''}`}
            onClick={() => {
              setRoom(r.number);
              setPeekRoom((prev) => (prev === r.number ? null : r.number));
            }}
            tabIndex={0}
          >
            <div className="room-tile-top">
              <strong>{r.number}</strong>
              <span className={statusPill(r.status)}>
                {r.status.toLowerCase().replace(/_/g, ' ')}
              </span>
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
            {r.balance && <div className="small">{fmtCurrency(Number(r.balance), currency)}</div>}
          </button>
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
              {lockDevices.length > 0
                ? lockDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} ({d.channel}:{d.endpoint})
                    </option>
                  ))
                : ['LDOOR-01', 'LDOOR-02'].map((id) => (
                    <option key={id} value={id}>
                      {id} (TCP:9100)
                    </option>
                  ))}
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
