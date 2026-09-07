const THREADS = [
  {
    id: 'm1',
    guest: 'David Chen · 201',
    preview: 'Extra towels please',
    unread: 2,
    agents: 'gm_frontdesk@hotelia.local',
  },
  {
    id: 'm2',
    guest: 'Ana Silva · 103',
    preview: 'Can I adjust check-out time?',
    unread: 1,
    agents: 'gm_frontdesk@hotelia.local',
  },
  {
    id: 'm3',
    guest: "Liam O'Brien · 302",
    preview: 'Dinner reservation for 2 at 8pm',
    unread: 0,
    agents: 'gm_dining@hotelia.local',
  },
];

export function Messaging() {
  return (
    <div>
      <h1>Messaging</h1>
      <p className="muted">Escalation triage (guest → front desk → PMS agents).</p>
      <table>
        <thead>
          <tr>
            <th>Guest</th>
            <th>Preview</th>
            <th>Unread</th>
            <th>Agent</th>
          </tr>
        </thead>
        <tbody>
          {THREADS.map((t) => (
            <tr key={t.id}>
              <td>{t.guest}</td>
              <td>{t.preview}</td>
              <td>{t.unread || '—'}</td>
              <td>
                <code>{t.agents}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
