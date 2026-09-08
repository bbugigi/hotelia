import { useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { enqueueCritical, unwrap, requireBridge } from '../offline/sync-client';
import { useToast } from '../toast';
import { fmtCurrency } from '../utils';
import type { PosChargeResult, PosVerification } from '../types';

type PaymentMethod = 'CASH' | 'MPESA_TILL' | 'MPESA_PAYBILL' | 'CARD';

/**
 * POS view — the strict DB charge-validation barrier.
 *
 * Kenya-first: cash, M-Pesa Till/Paybill, or card. All amounts in KES.
 * eTIMS invoice tracking pending compliance module.
 */

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  MPESA_TILL: 'M-Pesa Till',
  MPESA_PAYBILL: 'M-Pesa Paybill',
  CARD: 'Card',
};

export function Pos({ config }: { config: ConsoleConfig | null }) {
  const propertyId = config?.propertyId ?? null;
  const dbAvailable = Boolean(config?.dbAvailable);
  const currency = config?.currency ?? 'KES';
  const toast = useToast();

  const [room, setRoom] = useState('101');
  const [lastName, setLastName] = useState('');
  const [item, setItem] = useState('Champagne — House Brut');
  const [amount, setAmount] = useState('150.00');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [verification, setVerification] = useState<PosVerification | null>(null);
  const [charge, setCharge] = useState<PosChargeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const verifyAndPost = async () => {
    if (!lastName.trim()) {
      toast.push({
        kind: 'error',
        title: 'Room validation required',
        detail: 'Enter the guest Last Name (barrier GUEST_LASTNAME_ROOM).',
      });
      return;
    }
    setBusy(true);
    setVerification(null);
    setCharge(null);
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
          toast.push({
            kind: 'error',
            title: 'Verification failed',
            detail: `${ver.reason}: room ${room} has no verified ${lastName} stay.`,
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
        toast.push({
          kind: 'success',
          title: 'Charge posted',
          detail: `${fmtCurrency(res.total, currency)} to folio ${res.folioId.slice(0, 8)} · ${res.barrier.verifiedLastName} verified.`,
        });
      } else {
        const q = await enqueueCritical('posOrder', {
          item,
          amount,
          paymentMethod,
          folioType: 'PERSONAL',
          ...audit,
        });
        toast.push({
          kind: 'success',
          title: 'Queued offline',
          detail: `#${q.id.slice(0, 8)} — barrier re-runs when DB is online.`,
        });
      }
    } catch (err) {
      toast.push({ kind: 'error', title: 'POS error', detail: String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>POS — Room Posting</h1>
      <p className="muted">
        Folio charges require the strict DB barrier: Last Name must match the active CHECKED_IN
        Reservation inside a Serializable transaction. KES amounts. Payment method tracked for
        end-of-day reconciliation.
      </p>

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
            Amount ({currency}){' '}
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Payment method
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
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
            <li>Payment method tracked for reconciliation ledger.</li>
          </ul>
        </fieldset>
      </div>
    </div>
  );
}
