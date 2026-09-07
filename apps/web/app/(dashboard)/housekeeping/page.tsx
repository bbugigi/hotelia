import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Housekeeping',
};

export default function HousekeepingPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Housekeeping</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: 'Vacant Clean', value: '0', color: 'bg-emerald-100 text-emerald-700' },
          { label: 'Vacant Dirty', value: '0', color: 'bg-amber-100 text-amber-700' },
          { label: 'Occupied', value: '0', color: 'bg-sky-100 text-sky-700' },
          { label: 'Out of Order', value: '0', color: 'bg-rose-100 text-rose-700' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-sm font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Mobile-first housekeeping interface</p>
        <p className="mt-2">
          Real-time room status updates (Clean, Dirty, In-Inspection, Out-of-Order). Scaffold
          placeholder.
        </p>
      </div>
    </div>
  );
}
