const ORDERS = [
  { id: 'WO-1042', type: 'Plumbing', room: '204', status: 'In Progress', priority: 'High' },
  { id: 'WO-1043', type: 'HVAC', room: 'Lobby', status: 'Open', priority: 'Normal' },
  { id: 'WO-1044', type: 'Lock', room: '110', status: 'Open', priority: 'High' },
];

export function WorkOrders() {
  return (
    <div>
      <h1>Work Orders</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Location</th>
            <th>Status</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {ORDERS.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.type}</td>
              <td>{o.room}</td>
              <td>
                <span className="pill">{o.status.toLowerCase()}</span>
              </td>
              <td>{o.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
