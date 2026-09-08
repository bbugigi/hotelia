import { useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { enqueueCritical, unwrap, requireBridge } from '../offline/sync-client';
import type { PosChargeResult, PosVerification } from '../types';

/**
 * POS view — the strict DB charge-validation barrier.
 *
 * When the local database is provisioned, a charge NEVER reaches a folio
 * unless the main process re-derives the active CHECKED_IN stay for the room
 * inside a SERIALIZABLE transaction and matches the typed Last Name against
 * the DB guest. Rejections come back verbatim from main (no renderer-side
 * "validation" the terminal can bypass).
 *
 * When the database is unavailable (offline kiosk), the charge is still
 * captured — but only as an offline action in SQLite, never as a folio item,
 * and the barrier re-runs when the console is re-connected to the DB.
 */
export function Pos({ config }: { config: ConsoleConfig | null }) {
  const propertyId = config?.propertyId ?? null;
  const dbAvailable = Boolean(config?.dbAvailable);

  const [room, setRoom] = useState('101');
  const [lastName, setLastName] = useState('');
  const [item, setItem] = useState('Champagne — House Brut');
  const [amount, setAmount] = useState('150.00');
  const [verification, setVerification] = useState<PosVerification | null>(null);
  const [charge, setCharge] = useState<PosChargeResult | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setResult(
      dbAvailable
        ? null
        : {
            ok: false,
            text: 'Database not provisioned — charges will be queued offline (barrier re-runs on reconnect).',
          },
    );
  }, [dbAvailable]);

  const verifyAndPost = async () => {
    if (!lastName.trim()) {
      setResult({
        ok: false,
        text: 'Room validation required: enter the guest Last Name (barrier GUEST_LASTNAME_ROOM).',
      });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const audit = {
        roomNumber: room,
        verifiedBy: 'GUEST_LASTNAME_ROOM' as const,
        lastName,
        ipAddress: '10.0.0.24',
        deviceFingerprint: `fp_${crypto.randomUUID().slice(0, 10)} (POS terminal #3)`,
        userAgent: navigator.userAgent,
        ts: new Date().toISOString(),
      };

      if (dbAvailable && propertyId) {
        const ver = await unwrap(
          requireBridge().pos.verify({ propertyId, roomNumber: room, lastName }),
        );
        setVerification(ver);
        if (!ver.verified) {
          setResult({
            ok: false,
            text: `Rejected by database barrier (${ver.reason}): room ${room} has no verified ${lastName} stay.`,
          });
          return;
        }
        const res = await unwrap(
          requireBridge().pos.postCharge({
            propertyId,
            roomNumber: room,
            lastName,
            description: `${item} (${room})`,
            amount: Number(amount),
            itemName: item,
          }),
        );
        setCharge(res);
        setResult({
          ok: true,
          text: `Posted $${res.total.toFixed(2)} to folio ${res.folioId.slice(0, 8)} · ${res.barrier.verifiedLastName} verified.`,
        });
      } else {
        const q = await enqueueCritical('posOrder', {
          item,
          amount,
          folioType: 'PERSONAL',
          ...audit,
        });
        setResult({
          ok: true,
          text: `Queued offline (#${q.id.slice(0, 8)}) — barrier must re-run when DB is online.`,
        });
      }
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>POS — Room Posting</h1>
      <p className="muted">
        Folio charges require the strict DB barrier: Last Name must match the active CHECKED_IN
        Reservation inside a Serializable transaction, else the charge is rejected with zero folio
        mutation. IP/device audit is appended for chargeback defense.
      </p>

      {result && <p className={`result ${result.ok ? 'ok' : 'error'}`}>{result.text}</p>}
      {verification && (
        <pre className="box">
          {JSON.stringify(
            {
              barrier: 'GUEST_LASTNAME_ROOM',
              verified: verification.verified,
              reason: verification.reason,
              guest: verification.guest,
              reservation: verification.reservation,
            },
            null,
            2,
          )}
        </pre>
      )}
      {charge && (
        <pre className="box">
          {JSON.stringify(
            {
              folio: charge.folioId,
              totals: {
                amount: charge.amount,
                taxRate: charge.taxRate,
                tax: charge.taxAmount,
                total: charge.total,
              },
              folioBalance: charge.balance,
              barrier: charge.barrier,
            },
            null,
            2,
          )}
        </pre>
      )}

      <div className="grid2">
        <fieldset>
          <legend>Order</legend>
          <label>
            Room <input value={room} onChange={(e) => setRoom(e.target.value)} />
          </label>
          <label>
            Last Name <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label>
            Item <input value={item} onChange={(e) => setItem(e.target.value)} />
          </label>
          <label>
            Amount ($) <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button className="primary" disabled={busy} onClick={() => void verifyAndPost()}>
            Verify &amp; post to folio
          </button>
        </fieldset>
        <fieldset>
          <legend>Barrier contract</legend>
          <ul className="muted small">
            <li>Room must map to a CHECKED_IN Reservation (in DB).</li>
            <li>Last Name must match the reservation guest exactly.</li>
            <li>FolioItem created only inside the same Serializable transaction.</li>
            <li>Audit row written with barrier evidence on every charge.</li>
          </ul>
        </fieldset>
      </div>
    </div>
  );
}
