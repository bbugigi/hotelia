import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'POS & Dining',
};

export default function PosPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">POS & Dining</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Unified point of sale</p>
        <p className="mt-2">
          QR-code guest ordering, KDS integration, and physical POS terminal. Scaffold placeholder.
        </p>
      </div>
    </div>
  );
}
