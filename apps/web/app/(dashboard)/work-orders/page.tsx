import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Maintenance',
};

export default function WorkOrdersPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Work Orders & Maintenance</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Preventive & emergency maintenance</p>
        <p className="mt-2">Task allocation with SLA tracking. Scaffold placeholder.</p>
      </div>
    </div>
  );
}
