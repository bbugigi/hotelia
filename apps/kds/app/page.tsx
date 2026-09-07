'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface OrderEvent {
  orderId: string;
  roomId?: string;
  roomNumber?: string;
  channel?: string;
  items: Array<{ menuItemId: string; name: string; quantity: number; price: number }>;
  total: number;
}

interface OrderCard {
  orderId: string;
  createdAt: string;
  roomNumber?: string;
  items: OrderEvent['items'];
  total: number;
  column: 'pending' | 'preparing' | 'ready';
}

const STREAM_URL = process.env.NEXT_PUBLIC_KDS_STREAM_URL ?? 'http://localhost:3110/stream';
const SUBSCRIBED = [
  'order.placed',
  'order.confirmed',
  'order.preparing',
  'order.ready',
  'order.cancelled',
  'order.completed',
];

const COLUMNS: Array<{
  key: 'pending' | 'preparing' | 'ready';
  title: string;
  color: string;
  badge: string;
}> = [
  {
    key: 'pending',
    title: 'Pending',
    color: 'border-sky-500/50',
    badge: 'bg-sky-500/20 text-sky-300',
  },
  {
    key: 'preparing',
    title: 'Preparing',
    color: 'border-amber-500/50',
    badge: 'bg-amber-500/20 text-amber-300',
  },
  {
    key: 'ready',
    title: 'Ready',
    color: 'border-emerald-500/50',
    badge: 'bg-emerald-500/20 text-emerald-300',
  },
];

/**
 * Loophole #7 fix — persistent SSE connection straight into the console's
 * Redis-backed event broker, not REST polling. EventSource reconnects
 * automatically on drops and the server heartbeat keeps dead sockets detected.
 */
export default function KdsHomePage(): ReactNode {
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`${STREAM_URL}?events=${SUBSCRIBED.join(',')}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects (that IS the retry heartbeat).
    };

    es.addEventListener('order.placed', (e) => {
      const data = JSON.parse(e.data) as OrderEvent;
      setOrders((prev) => [
        { ...data, createdAt: new Date().toISOString(), column: 'pending' },
        ...prev.filter((o) => o.orderId !== data.orderId),
      ]);
    });
    es.addEventListener('order.confirmed', (e) => move(JSON.parse(e.data).orderId, 'pending'));
    es.addEventListener('order.preparing', (e) => move(JSON.parse(e.data).orderId, 'preparing'));
    es.addEventListener('order.ready', (e) => move(JSON.parse(e.data).orderId, 'ready'));
    es.addEventListener('order.cancelled', (e) => removeOrder(JSON.parse(e.data).orderId));
    es.addEventListener('order.completed', (e) => removeOrder(JSON.parse(e.data).orderId));

    function move(orderId: string, column: OrderCard['column']) {
      setOrders((prev) => prev.map((o) => (o.orderId === orderId ? { ...o, column } : o)));
    }
    function removeOrder(orderId: string) {
      setOrders((prev) => prev.filter((o) => o.orderId !== orderId));
    }

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Kitchen Display</h1>
        <span
          className={`rounded-full px-3 py-1 text-sm ${
            connected ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-300'
          }`}
        >
          {connected ? '● Live' : '● Reconnecting'}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.column === col.key);
          return (
            <div key={col.key} className={`rounded-xl border bg-slate-900 p-4 ${col.color}`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium text-slate-200">{col.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${col.badge}`}>
                  {list.length}
                </span>
              </div>
              {list.length === 0 && <p className="text-sm text-slate-500">—</p>}
              <div className="flex flex-col gap-3">
                {list.map((o) => (
                  <div
                    key={o.orderId}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-3"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-400">{o.orderId}</span>
                      {o.roomNumber && (
                        <span className="text-sm text-amber-300">Room {o.roomNumber}</span>
                      )}
                    </div>
                    <ul className="text-sm text-slate-200">
                      {o.items.map((it) => (
                        <li key={it.menuItemId}>
                          {it.quantity}× {it.name}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 text-right text-sm font-semibold text-slate-100">
                      ${o.total.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
