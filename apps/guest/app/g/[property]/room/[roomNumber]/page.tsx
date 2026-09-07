import type { Metadata } from 'next';

interface RoomPageProps {
  params: Promise<{ property: string; roomNumber: string }>;
}

export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const { property } = await params;
  return { title: `Room Services | ${property}` };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomNumber } = await params;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Room {roomNumber}</h1>
      <p className="mt-2 max-w-xs text-sm text-slate-500">
        Order dining, request amenities, and chat with the front desk.
      </p>
    </main>
  );
}
