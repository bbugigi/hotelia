import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Messaging',
};

export default function MessagingPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Guest Messaging</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Unified guest communication hub</p>
        <p className="mt-2">
          Consolidated SMS, WhatsApp, and Web-Chat inbox. Scaffold placeholder.
        </p>
      </div>
    </div>
  );
}
