import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat | Hotelia',
};

export default function ChatPage() {
  return (
    <main className="flex min-h-screen flex-col px-4 pb-safe pt-safe">
      <header className="flex items-center gap-3 border-b border-slate-100 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700">
          H
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-900">Front Desk</h1>
          <p className="text-xs text-emerald-600">● Online</p>
        </div>
      </header>
      <div className="flex-1" />
      <footer className="flex gap-2 border-t border-slate-100 py-3">
        <input
          type="text"
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white">
          Send
        </button>
      </footer>
    </main>
  );
}
