import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dashboard | Hotelia',
};

const navItems = [
  { href: '/pms', label: 'Front Desk', icon: '🗓️' },
  { href: '/housekeeping', label: 'Housekeeping', icon: '🧹' },
  { href: '/pos', label: 'POS / Dining', icon: '🍽️' },
  { href: '/messaging', label: 'Messaging', icon: '💬' },
  { href: '/work-orders', label: 'Maintenance', icon: '🔧' },
  { href: '/revenue', label: 'Revenue', icon: '📈' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-16 shrink-0 border-r border-slate-200 bg-white md:w-56">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white text-sm font-bold">
            H
          </div>
          <span className="hidden text-lg font-semibold text-slate-900 md:block">Hotelia</span>
        </div>

        <nav className="space-y-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <span>{item.icon}</span>
              <span className="hidden md:block">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
          <h1 className="text-sm font-semibold text-slate-500">Property: Hotel Name</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">Front Desk</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-medium">
              FD
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
