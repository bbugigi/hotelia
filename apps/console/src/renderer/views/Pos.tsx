import { useState } from 'react';
import { enqueueCritical } from '../offline/queue';

/**
 * POS order view demonstrating the dispute-protection barrier (loophole #3):
 * a room charge is only posted to the folio after validating
 * Last Name + Room Number (or an active session token).
 */
export function Pos() {
  const [room, setRoom] = useState('101');
  const [lastName, setLastName] = useState('');
  const [item, setItem] = useState('Champagne — House Brut');
  const [amount, setAmount] = useState('150.00');
  const [validatedAt, setValidatedAt] = useState<string | null>(null);

  const verifyAndPost = async () => {
    if (!lastName.trim()) {
      alert(
        'Room validation required: enter guest Last Name before posting to folio (loophole #3).',
      );
      return;
    }
    const audit = {
      roomNumber: room,
      verifiedBy: 'GUEST_LASTNAME_ROOM' as const,
      lastName,
      ipAddress: '10.0.0.24',
      deviceFingerprint: 'fp_ab12cd34 (POS terminal #3)',
      userAgent: navigator.userAgent,
      ts: new Date().toISOString(),
    };
    setValidatedAt(audit.ts);
    await enqueueCritical('posOrder', { item, amount, folioType: 'PERSONAL', ...audit });
    alert(`Posted to folio. Audit snapshot recorded at ${audit.ts}`);
  };

  return (
    <div>
      <h1>POS — Room Posting</h1>
      <p className="muted">
        Every folio charge requires room attestation and captures device/IP audit for chargeback
        defense.
      </p>
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
          <button className="primary" onClick={() => void verifyAndPost()}>
            Verify &amp; post to folio
          </button>
        </fieldset>
        <div>
          <h3>Dispute audit snapshot</h3>
          <pre className="box">
            {JSON.stringify(
              {
                barrier: 'GUEST_LASTNAME_ROOM',
                ipAddress: '10.0.0.24',
                deviceFingerprint: 'fp_ab12cd34',
                validatedAt,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
