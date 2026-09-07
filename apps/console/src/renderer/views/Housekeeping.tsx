const TASKS = [
  { room: '101', status: 'Dirty', priority: 'High', due: '11:00' },
  { room: '102', status: 'Clean', priority: 'Low', due: '-' },
  { room: '103', status: 'Inspected', priority: 'Low', due: '-' },
  { room: '201', status: 'Dirty', priority: 'Normal', due: '13:00' },
  { room: '202', status: 'OOO', priority: 'Low', due: '-' },
];

export function Housekeeping() {
  return (
    <div>
      <h1>Housekeeping</h1>
      <table>
        <thead>
          <tr>
            <th>Room</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {TASKS.map((t) => (
            <tr key={t.room}>
              <td>{t.room}</td>
              <td>
                <span className={`pill ${t.status.toLowerCase()}`}>{t.status}</span>
              </td>
              <td>{t.priority}</td>
              <td>{t.due}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
