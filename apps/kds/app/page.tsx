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
// Runtime token precedence: NEXT_PUBLIC_KDS_STREAM_TOKEN > ?token= (LAN provisioning).
const STREAM_TOKEN =
  process.env.NEXT_PUBLIC_KDS_STREAM_TOKEN ??
  (typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('token') ?? '')
    : '');
const RETRY_MS = 3000;
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

function move(orders: OrderCard[], orderId: string, column: OrderCard['column']): OrderCard[] {
  return orders.map((o) => (o.orderId === orderId ? { ...o, column } : o));
}
function removeOrder(orders: OrderCard[], orderId: string): OrderCard[] {
  return orders.filter((o) => o.orderId !== orderId);
}
function upsert(orders: OrderCard[], e: OrderEvent): OrderCard[] {
  return [
    { ...e, createdAt: new Date().toISOString(), column: 'pending' },
    ...orders.filter((o) => o.orderId !== e.orderId),
  ];
}

/**
 * Loophole #7 fix — persistent SSE stream from the console broker.
 *
 * Uses fetch + ReadableStream (NOT EventSource) because EventSource cannot
 * send an `Authorization` header, and the broker now requires the Bearer
 * device token on /stream. The stream wrapper auto-reconnects on drop /
 * 401 / server heartbeat death with a fixed backoff.
 */
export default function KdsHomePage(): ReactNode {
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const streamRef = useRef<{ controller: AbortController; retry: () => void } | null>(null);

  useEffect(() => {
    let controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    streamRef.current = { controller, retry: () => void connect() };

    async function connect(): Promise<void> {
      if (controller.signal.aborted) controller = new AbortController();
      try {
        const res = await fetch(`${STREAM_URL}?events=${SUBSCRIBED.join(',')}`, {
          headers: STREAM_TOKEN ? { Authorization: `Bearer ${STREAM_TOKEN}` } : {},
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          if (res.status === 401) {
            setAuthError(true);
            setConnected(false);
            retryTimer = setTimeout(() => void connect(), RETRY_MS);
            return;
          }
          throw new Error(`stream http ${res.status}`);
        }
        setAuthError(false);
        setConnected(true);

        if (!res.body) throw new Error('no response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Consume SSE frames split across arbitrary chunks.
        const consume = async (): Promise<void> => {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
              const lines = frame.split('\n');
              const event = lines.find((l) => l.startsWith('event: '))?.slice(7) ?? '';
              const data = lines.find((l) => l.startsWith('data: '))?.slice(6);
              if (!data) continue;
              handleFrame(event, data);
            }
          }
        };
        await consume();
        // Stream ended cleanly (socket closed) → reconnect.
        setConnected(false);
        retryTimer = setTimeout(() => void connect(), RETRY_MS);
      } catch (err) {
        if (controller.signal.aborted) return;
        setConnected(false);
        retryTimer = setTimeout(() => void connect(), RETRY_MS);
        console.warn('kds stream retry scheduled', err);
      }
    }

    function handleFrame(event: string, data: string): void {
      try {
        if (event === 'order.placed')
          setOrders((prev) => upsert(prev, JSON.parse(data) as OrderEvent));
        else if (event === 'order.confirmed')
          setOrders((prev) => move(prev, JSON.parse(data).orderId, 'pending'));
        else if (event === 'order.preparing')
          setOrders((prev) => move(prev, JSON.parse(data).orderId, 'preparing'));
        else if (event === 'order.ready')
          setOrders((prev) => move(prev, JSON.parse(data).orderId, 'ready'));
        else if (event === 'order.cancelled' || event === 'order.completed')
          setOrders((prev) => removeOrder(prev, JSON.parse(data).orderId));
      } catch {
        /* malformed frame — ignore, keep stream alive */
      }
    }

    void connect();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      streamRef.current = null;
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
          {connected
            ? '● Live'
            : authError
              ? '● Unauthorized (set NEXT_PUBLIC_KDS_STREAM_TOKEN)'
              : '● Reconnecting'}
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
