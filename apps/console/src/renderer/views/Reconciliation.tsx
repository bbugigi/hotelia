import { useCallback, useEffect, useState } from 'react';
import type { ConsoleConfig } from '../App';
import { unwrap, requireBridge } from '../offline/sync-client';
import { useToast } from '../toast';
import { fmtCurrency, idempotencyKey } from '../utils';
import type { MpesaLedgerSummary, PaymentLedgerRow, PaymentMethod } from '../types';

/**
 * Reconciliation — Kenya-first payment ledger for M-Pesa Till/Paybill,
 * cash, and card. Records intents, matches confirmations, tracks eTIMS
 * state — the console's answer to reconciliation hell.
 *
 * No cloud dependency. All data in local SQLite.
 */

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  MPESA_TILL: 'M-Pesa Till',
  MPESA_PAYBILL: 'M-Pesa Paybill',
  CARD: 'Card',
};

export function Reconciliation({ config }: { config: ConsoleConfig | null }) {
  const currency = config?.currency ?? 'KES';
  const toast = useToast();

  const [ledger, setLedger] = useState<PaymentLedgerRow[]>([]);
  const [summary, setSummary] = useState<MpesaLedgerSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Intent form
  const [intentMethod, setIntentMethod] = useState<PaymentMethod>('MPESA_TILL');
  const [intentAmount, setIntentAmount] = useState('');
  const [intentGuest, setIntentGuest] = useState('');
  const [intentRoom, setIntentRoom] = useState('');
  const [intentRef, setIntentRef] = useState('');

  // Confirmation form
  const [confReceipt, setConfReceipt] = useState('');
  const [confAmount, setConfAmount] = useState('');
  const [confMethod, setConfMethod] = useState<PaymentMethod>('MPESA_TILL');
  const [confPhoneTail, setConfPhoneTail] = useState('');

  const refresh = useCallback(async () => {
    if (!window.hotelia) return;
    try {
      const [rows, sum] = await Promise.all([
        unwrap(requireBridge().payments.list()),
        unwrap(requireBridge().payments.summary()),
      ]);
      setLedger(rows);
      setSummary(sum);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recordIntent = async () => {
    if (!intentAmount || !intentGuest || !intentRoom) {
      toast.push({
        kind: 'error',
        title: 'Missing fields',
        detail: 'Amount, guest name, and room are required.',
      });
      return;
    }
    setBusy(true);
    try {
      await unwrap(
        requireBridge().payments.recordIntent({
          method: intentMethod,
          amount: parseFloat(intentAmount),
          currency,
          guestName: intentGuest,
          roomNumber: intentRoom,
          reference: intentRef || undefined,
          idempotencyKey: idempotencyKey('intent'),
        }),
      );
      toast.push({ kind: 'success', title: 'Payment intent recorded' });
      setIntentAmount('');
      setIntentGuest('');
      setIntentRoom('');
      setIntentRef('');
      await refresh();
    } catch (err) {
      toast.push({ kind: 'error', title: 'Failed to record intent', detail: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const recordConfirmation = async () => {
    if (!confReceipt || !confAmount) {
      toast.push({
        kind: 'error',
        title: 'Missing fields',
        detail: 'Receipt and amount are required.',
      });
      return;
    }
    setBusy(true);
    try {
      await unwrap(
        requireBridge().payments.recordConfirmation({
          receipt: confReceipt,
          amount: parseFloat(confAmount),
          currency,
          method: confMethod,
          phoneTail: confPhoneTail || undefined,
          idempotencyKey: idempotencyKey('conf'),
        }),
      );
      toast.push({
        kind: 'success',
        title: 'Confirmation recorded',
        detail: 'Auto-matching attempted.',
      });
      setConfReceipt('');
      setConfAmount('');
      setConfPhoneTail('');
      await refresh();
    } catch (err) {
      toast.push({ kind: 'error', title: 'Failed to record confirmation', detail: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const matchIntent = async (confirmationId: string, intentId: string) => {
    setBusy(true);
    try {
      await unwrap(
        requireBridge().payments.match({ confirmationId, intentId, operatorId: 'manual' }),
      );
      toast.push({ kind: 'success', title: 'Matched!' });
      await refresh();
    } catch (err) {
      toast.push({ kind: 'error', title: 'Match failed', detail: String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Reconciliation</h1>
      <p className="muted">
        Payment ledger for M-Pesa, cash, and card. Record intents (before confirmation), match
        incoming confirmations, and track eTIMS status — all offline-first in local SQLite.
      </p>

      {error && <p className="result error">{error}</p>}

      {/* Summary chips */}
      {summary && (
        <div className="ledger-summary">
          <div className="chip">
            <span className="chip-value">{summary.pendingIntents}</span>
            <span className="chip-label">Pending Intents</span>
          </div>
          <div className="chip">
            <span className="chip-value">{summary.unmatchedConfirmations}</span>
            <span className="chip-label">Unmatched</span>
          </div>
          <div className="chip">
            <span className="chip-value">{summary.matched}</span>
            <span className="chip-label">Matched</span>
          </div>
          <div className="chip">
            <span className="chip-value">{summary.reversed}</span>
            <span className="chip-label">Reversed</span>
          </div>
        </div>
      )}

      <div className="grid2">
        {/* Intent form */}
        <fieldset>
          <legend>Record Payment Intent</legend>
          <label>
            Method
            <select
              value={intentMethod}
              onChange={(e) => setIntentMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount ({currency})
            <input
              type="number"
              step="0.01"
              min="0"
              value={intentAmount}
              onChange={(e) => setIntentAmount(e.target.value)}
            />
          </label>
          <label>
            Guest Name
            <input value={intentGuest} onChange={(e) => setIntentGuest(e.target.value)} />
          </label>
          <label>
            Room
            <input value={intentRoom} onChange={(e) => setIntentRoom(e.target.value)} />
          </label>
          <label>
            Reference (optional)
            <input value={intentRef} onChange={(e) => setIntentRef(e.target.value)} />
          </label>
          <button className="primary" disabled={busy} onClick={() => void recordIntent()}>
            Record Intent
          </button>
        </fieldset>

        {/* Confirmation form */}
        <fieldset>
          <legend>Record M-Pesa / Card Confirmation</legend>
          <label>
            Receipt / Transaction ID
            <input value={confReceipt} onChange={(e) => setConfReceipt(e.target.value)} />
          </label>
          <label>
            Amount ({currency})
            <input
              type="number"
              step="0.01"
              min="0"
              value={confAmount}
              onChange={(e) => setConfAmount(e.target.value)}
            />
          </label>
          <label>
            Method
            <select
              value={confMethod}
              onChange={(e) => setConfMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phone tail (optional, e.g. ***1234)
            <input value={confPhoneTail} onChange={(e) => setConfPhoneTail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy} onClick={() => void recordConfirmation()}>
            Record Confirmation
          </button>
        </fieldset>
      </div>

      {/* Ledger table */}
      <h2>Ledger</h2>
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Kind</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Guest / Room</th>
              <th>Status</th>
              <th>eTIMS</th>
              <th>Ref</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No ledger entries yet.
                </td>
              </tr>
            )}
            {ledger.map((row) => (
              <tr key={row.id} className={`ledger-row status-${row.status.toLowerCase()}`}>
                <td className="small muted">
                  {new Date(row.recordedAt).toLocaleTimeString('en-KE')}
                </td>
                <td>{row.kind}</td>
                <td>{METHOD_LABELS[row.method]}</td>
                <td>{fmtCurrency(row.amount, row.currency)}</td>
                <td>
                  {row.guestName} <span className="muted">/ {row.roomNumber}</span>
                </td>
                <td>
                  <span className={`pill ${row.status.toLowerCase()}`}>{row.status}</span>
                </td>
                <td>
                  <span className={`pill etims-${row.etimsState.toLowerCase()}`}>
                    {row.etimsState}
                  </span>
                </td>
                <td className="small muted">{row.receipt || row.reference || '—'}</td>
                <td>
                  {row.status === 'UNMATCHED' && row.kind === 'CONFIRMATION' && (
                    <button
                      className="small"
                      disabled={busy}
                      onClick={() => {
                        // Find a pending intent with matching amount+method
                        const intent = ledger.find(
                          (r) =>
                            r.kind === 'INTENT' &&
                            r.status === 'PENDING' &&
                            r.method === row.method &&
                            r.amount === row.amount,
                        );
                        if (intent) {
                          void matchIntent(row.id, intent.id);
                        } else {
                          toast.push({
                            kind: 'warn',
                            title: 'No matching intent found',
                            detail: 'Create a payment intent first, then match manually.',
                          });
                        }
                      }}
                    >
                      Match
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="muted" onClick={() => void refresh()} disabled={busy}>
        Refresh
      </button>
    </div>
  );
}
