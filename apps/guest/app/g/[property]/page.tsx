import type { Metadata } from 'next';

interface PropertyPageProps {
  params: Promise<{ property: string }>;
}

export async function generateMetadata({ params }: PropertyPageProps): Promise<Metadata> {
  const { property } = await params;
  return { title: `${property} | Hotelia` };
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { property } = await params;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900 capitalize">{property}</h1>
      <p className="mt-2 max-w-xs text-sm text-slate-500">
        Welcome to your stay. Your room services are ready when you are.
      </p>
    </main>
  );
}
