import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome | Hotelia Guest',
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
        H
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">Welcome</h1>
      <p className="mt-2 max-w-xs text-sm text-slate-500">
        Scan the QR code in your room to manage your stay, order dining, and chat with the hotel.
      </p>
      <a
        href="https://github.com"
        className="mt-8 text-sm text-brand-600 underline-offset-2 hover:underline"
      >
        Not sure? Contact the front desk
      </a>
    </main>
  );
}
