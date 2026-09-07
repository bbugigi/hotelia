const METRICS = [
  { label: 'RevPAR today', value: '$218.40', delta: '+6.2%' },
  { label: 'ADR', value: '$241.90', delta: '+3.1%' },
  { label: 'Occupancy', value: '91.4%', delta: '+2.0pt' },
  { label: 'Folio balance (open)', value: '$14,220', delta: '—' },
];

export function Revenue() {
  return (
    <div>
      <h1>Revenue</h1>
      <div className="metric-grid">
        {METRICS.map((m) => (
          <div key={m.label} className="metric">
            <span className="muted">{m.label}</span>
            <strong>{m.value}</strong>
            <span className="delta">{m.delta}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        Daily audit close: immutable after cutoff — post-cutoff adjustments are issued as reversals
        (loophole #5).
      </p>
    </div>
  );
}
