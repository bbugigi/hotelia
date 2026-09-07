import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Revenue',
};

export default function RevenuePage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Revenue Management</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Dynamic pricing & channel manager</p>
        <p className="mt-2">
          Occupancy-based rates, demand pacing, OTA channel sync. Scaffold placeholder.
        </p>
      </div>
    </div>
  );
}
