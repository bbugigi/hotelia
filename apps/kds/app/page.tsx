import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kitchen Display',
};

export default function KdsHomePage() {
  const columns = [
    { title: 'Pending', color: 'border-sky-500/50', badge: 'bg-sky-500/20 text-sky-300' },
    { title: 'Preparing', color: 'border-amber-500/50', badge: 'bg-amber-500/20 text-amber-300' },
    { title: 'Ready', color: 'border-emerald-500/50', badge: 'bg-emerald-500/20 text-emerald-300' },
  ];

  return (
    <main className="min-h-screen p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Kitchen Display</h1>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
          Live: <span className="text-emerald-400">Connected</span>
        </span>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {columns.map(({ title, color, badge }) => (
          <div key={title} className={`rounded-xl border p-4 ${color}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">{title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>0</span>
            </div>
            <p className="text-sm text-slate-500">No orders yet</p>
          </div>
        ))}
      </div>
    </main>
  );
}
