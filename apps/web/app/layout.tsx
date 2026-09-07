import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Hotelia',
    template: '%s | Hotelia',
  },
  description: 'Cloud-native all-in-one hotel management platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
