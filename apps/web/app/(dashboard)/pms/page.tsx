import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Front Desk',
};

export default function PmsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Front Desk — Tape Chart</h2>

      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Interactive reservation grid</p>
        <p className="mt-2">
          The tape chart module will render reservations and room status in real time. This is a
          scaffold placeholder.
        </p>
        <div className="mt-4 grid grid-cols-5 gap-2 rounded-lg border border-slate-200 p-3 text-center text-xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => (
            <div key={day} className="text-slate-400">
              {day}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
