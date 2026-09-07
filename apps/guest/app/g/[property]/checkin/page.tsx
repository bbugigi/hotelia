import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Check In | Hotelia',
};

export default function CheckInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Complete Your Check-In</h1>
      <p className="mt-2 max-w-xs text-sm text-slate-500">
        ID upload, card pre-authorization, and digital signature — arrive and go straight to your
        room.
      </p>
    </main>
  );
}
