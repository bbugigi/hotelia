import http from 'http';
import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import { eventRegistry, type DomainEventName } from '@hotelia/events';

export interface StreamEventBusLike {
  subscribe(
    name: DomainEventName | typeof eventRegistry.ALL,
    handler: (e: { type: string; payload: Record<string, unknown> }) => void,
  ): () => void;
}

export class LocalStreamBus implements StreamEventBusLike {
  private handlers = new Map<string, Array<(e: unknown) => void>>();

  subscribe(
    name: string,
    handler: (e: { type: string; payload: Record<string, unknown> }) => void,
  ): () => void {
    const h = handler as (e: unknown) => void;
    const list = this.handlers.get(name) ?? [];
    list.push(h);
    this.handlers.set(name, list);
    return () => {
      const cur = this.handlers.get(name)?.filter((x) => x !== h);
      this.handlers.set(name, cur ?? []);
    };
  }

  publish<T extends object>(name: DomainEventName, payload: T): void {
    const e = { type: name, payload };
    for (const handler of this.handlers.get(name) ?? []) handler(e);
    for (const handler of this.handlers.get(eventRegistry.ALL) ?? []) handler(e);
  }
}

const bus = new LocalStreamBus();

export { bus };

export function startLocalServer(port = 3110): http.Server {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.get('/stream', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');

    const events = String(req.query.events ?? '')
      .split(',')
      .filter(Boolean) as string[];
    const showsAll = !events.length || events.some((e) => e === eventRegistry.ALL);

    const unsubscribers: Array<() => void> = [];
    for (const name of eventRegistry.list()) {
      if (!showsAll && !events.includes(name)) continue;
      unsubscribers.push(
        bus.subscribe(name, (e) => {
          res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`);
        }),
      );
    }
    res.write(
      `event: hello\ndata: ${JSON.stringify({ ok: true, subscribed: showsAll ? 'all' : events })}\n\n`,
    );

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    res.on('close', () => {
      clearInterval(heartbeat);
      for (const off of unsubscribers) off();
    });
  });

  app.post('/packet', (req: Request, res: Response) => {
    const { type, payload } = (req.body ?? {}) as { type?: DomainEventName; payload?: unknown };
    if (!type || !eventRegistry.isValid(type)) {
      res.status(400).json({ error: `unknown event type: ${String(type)}` });
      return;
    }
    bus.publish(type, payload as Record<string, unknown>);
    res.status(202).json({ accepted: type });
  });

  const server = app.listen(port, () => {
    console.log(`[hotelia-console] local server + SSE live on http://localhost:${port}`);
  });
  return server;
}
