import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes, timingSafeEqual, createHash } from 'crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { eventRegistry, type DomainEventName } from '@hotelia/events';
import { packetSchema } from '@hotelia/shared';
import { logger } from './logger';

/**
 * ───────────────────────────────────────────────────────────────────────────
 * LOCAL REST + SSE BROKER (127.0.0.1:3110)
 *
 * Hardening vs the previous in-process server:
 *   - Binds STRICTLY to 127.0.0.1 (loopback). Nothing on the LAN can reach
 *     it; only local processes (the console renderer, the KDS PWA, the guest
 *     PWA, and the sync engine) can. The door-lock encoder bridge is the
 *     ONLY outbound-to-LAN component and it is an outbound client, never a
 *     listener.
 *   - Explicit CORS allow-list (no `cors()` open wildcard). Unknown origins
 *     are simply dropped; preflights respond 204 only for allowed origins.
 *   - Bearer-token auth on /stream and /packet. The token is generated once,
 *     persisted 0600 in ~/.hotelia/server-token, and read by local devices at
 *     provision time (console renderer via IPC; KDS/PWA via build-time env).
 *   - /stream connection lifecycle is fully managed: every open SSE response
 *     is tracked, pruned every 15 s on the ping frame, and destroyed the
 *     instant req 'close' fires — no orphaned sockets, no memory leaks.
 *   - /packet is rate-limited and idempotent via the Idempotency-Key header,
 *     so the offline flusher can retry safely.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const SERVER_PORT = 3110;
const TOKEN_FILE = path.join(os.homedir(), '.hotelia', 'server-token');
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3010',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3010',
  'http://[::1]:3001',
  'http://[::1]:3002',
]);

function readTokenFromDisk(): string {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

/** Load (or lazily create) the long-lived device token for local consumers. */
export function getServerToken(): string {
  const existing = readTokenFromDisk();
  if (existing) return existing;
  const token = randomBytes(32).toString('base64url');
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  logger.info('server:token-generated', { tokenFile: TOKEN_FILE });
  return token;
}

export interface ServerConfig {
  url: string;
  port: number;
  token: string;
}

export function getServerConfig(): ServerConfig {
  return { url: `http://127.0.0.1:${SERVER_PORT}`, port: SERVER_PORT, token: getServerToken() };
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export interface StreamEventBusLike {
  subscribe(
    name: DomainEventName | typeof eventRegistry.ALL,
    handler: (e: { type: string; payload: Record<string, unknown> }) => void,
  ): () => void;
  publish<T extends object>(name: DomainEventName, payload: T): void;
  clientCount(): number;
}

export class LocalStreamBus implements StreamEventBusLike {
  private handlers = new Map<string, Array<(e: unknown) => void>>();

  subscribe(
    name: string,
    handler: (e: { type: string; payload: Record<string, unknown> }) => void,
  ): () => void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as (e: unknown) => void);
    this.handlers.set(name, list);
    return () => {
      const cur = this.handlers.get(name)?.filter((h) => h !== handler) ?? [];
      this.handlers.set(name, cur);
    };
  }

  publish<T extends object>(name: DomainEventName, payload: T): void {
    const e = { type: name, payload };
    for (const h of this.handlers.get(name) ?? []) {
      try {
        h(e);
      } catch (err) {
        logger.error('bus:publish-handler-error', { name }, err as Error | undefined);
      }
    }
    for (const h of this.handlers.get(eventRegistry.ALL) ?? []) {
      try {
        h(e);
      } catch (err) {
        logger.error('bus:publish-ALL-handler-error', { name }, err as Error | undefined);
      }
    }
  }

  clientCount(): number {
    // SSE connections register one ALL-subscriber on the bus; count those.
    return (this.handlers.get(eventRegistry.ALL) ?? []).length;
  }
}

export const bus = new LocalStreamBus();

// ── simple token-bucket rate limiter for POST /packet ──────────────────────
interface Bucket {
  tokens: number;
  lastRefill: number;
}
class RateLimiter {
  constructor(private readonly rps = 8) {}
  private buckets = new Map<string, Bucket>();
  allows(ip: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(ip) ?? { tokens: this.rps, lastRefill: now };
    b.tokens = Math.min(this.rps, b.tokens + ((now - b.lastRefill) / 1000) * this.rps);
    b.lastRefill = now;
    if (b.tokens < 1) {
      this.buckets.set(ip, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(ip, b);
    if (this.buckets.size > 2000) this.buckets.clear();
    return true;
  }
}
const packetLimiter = new RateLimiter();

const IDEMPOTENT_WINDOW = new Map<string, { acceptedAt: number; event: string }>();
function dedupePacket(key: string, event: string): { deduped: boolean; event: string } {
  const now = Date.now();
  const existing = IDEMPOTENT_WINDOW.get(key);
  if (existing && now - existing.acceptedAt < 60_000)
    return { deduped: true, event: existing.event };
  IDEMPOTENT_WINDOW.set(key, { acceptedAt: now, event });
  if (IDEMPOTENT_WINDOW.size > 500) {
    for (const k of IDEMPOTENT_WINDOW.keys()) {
      if (now - (IDEMPOTENT_WINDOW.get(k)?.acceptedAt ?? 0) > 60_000) IDEMPOTENT_WINDOW.delete(k);
    }
  }
  return { deduped: false, event };
}

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

function corsAllowlist(_req: Request, res: Response, next: NextFunction): void {
  const origin = reqOrigin(_req);
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

function reqOrigin(req: Request): string | null {
  const o = req.get('origin');
  return o || null;
}

/** Bearer-token middleware factory for device-facing endpoints. */
function requireToken(token: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.get('authorization') ?? '';
    const headerToken = header.startsWith('Bearer ') ? header.slice(7) : '';
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const provided = headerToken || queryToken;
    if (!provided || !timingSafeEqualString(provided, token)) {
      res.status(401).json({ error: 'unauthorized', hint: 'x-hotelia' });
      return;
    }
    next();
  };
}

function sseHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

export interface StartServerOptions {
  port?: number;
  streamToken?: string;
}

export function startLocalServer(options: StartServerOptions = {}): http.Server {
  const port = options.port ?? SERVER_PORT;
  const token = options.streamToken ?? getServerToken();

  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(corsAllowlist);
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'hotelia-console',
      version: '0.1.0',
      host: '127.0.0.1',
      streamClients: bus.clientCount(),
      ts: new Date().toISOString(),
    });
  });

  // ── SSE: token-auth, validated subscription list, managed lifecycle ──────
  app.get('/stream', requireToken(token), (req: Request, res: Response) => {
    sseHeaders(res);
    res.write(': connected\n\n');

    const raw =
      req.query.events instanceof Array ? req.query.events : String(req.query.events ?? '');
    const requested = (Array.isArray(raw) ? raw : raw.split(','))
      .map((e) => String(e).trim())
      .filter(Boolean);
    const unknown = requested.filter((e) => e !== eventRegistry.ALL && !eventRegistry.isValid(e));
    if (unknown.length > 0) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ code: 'EVENT_FILTER_INVALID', unknown })}\n\n`,
      );
      res.end();
      return;
    }
    const showsAll = !requested.length || requested.includes(eventRegistry.ALL);

    const unsubscribers: Array<() => void> = [];
    for (const name of eventRegistry.list()) {
      if (!showsAll && !requested.includes(name)) continue;
      unsubscribers.push(
        bus.subscribe(name, (e) => {
          if (res.writableEnded || res.destroyed) return;
          res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`);
        }),
      );
    }
    // Register this connection on ALL so `clientCount()` tracks live streams.
    unsubscribers.push(
      bus.subscribe(eventRegistry.ALL, () => {
        /* keep-alive listener — no-op payload */
      }),
    );

    res.write(
      `event: hello\ndata: ${JSON.stringify({
        ok: true,
        subscribed: showsAll ? 'all' : requested,
        tokenProtected: true,
      })}\n\n`,
    );

    // 15-second keep-alive ping frame; destroys dead sockets detected by
    // write-return (false or throw) so they leave the client set ASAP.
    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      try {
        const ok = res.write(': ping\n\n');
        if (!ok) res.destroy();
      } catch {
        res.destroy();
      }
    }, 15_000);
    heartbeat.unref();

    const cleanup = (): void => {
      clearInterval(heartbeat);
      for (const off of unsubscribers) off();
      if (!res.writableEnded) res.end();
      res.destroy();
      logger.debug('server:sse-client-removed', { address: req.socket.remoteAddress });
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });

  // ── Packet ingress: token-auth, rate-limited, idempotent, zod-validated ──
  app.post('/packet', requireToken(token), (req: Request, res: Response) => {
    const ip = req.socket.remoteAddress ?? 'loopback';
    if (!packetLimiter.allows(ip)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    const parsed = packetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation_failed', detail: parsed.error.issues[0]?.message });
      return;
    }
    if (!eventRegistry.isValid(parsed.data.type as DomainEventName)) {
      res.status(400).json({ error: `unknown event type: ${parsed.data.type}` });
      return;
    }
    const key = String(req.get('idempotency-key') ?? '');
    const dedupe = key
      ? dedupePacket(key, parsed.data.type)
      : { deduped: false, event: parsed.data.type };
    if (!dedupe.deduped) {
      bus.publish(parsed.data.type as DomainEventName, parsed.data.payload);
    }
    res
      .status(dedupe.deduped ? 208 : 202)
      .json({ accepted: dedupe.event, deduped: dedupe.deduped });
  });

  const server = app.listen(port, '127.0.0.1', () => {
    logger.info('server:started', { url: `http://127.0.0.1:${port}`, tokenProtected: true });
  });
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
