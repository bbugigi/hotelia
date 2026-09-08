import { createWriteStream, mkdirSync, type WriteStream } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Structured JSONL logger for the console main process.
 *
 * Every log line is a single JSON object: { ts, level, service, pid, msg, ctx? }.
 * Errors get an `err` envelope (name/message/stack) so correlation with
 * Sentry-style tooling stays trivial, and IPC/SSE failures above all never
 * crash the process. Writes go to `~/.hotelia/console.log` (0644-safe, private
 * dir) and to stderr so `electron . --no-sandbox` output includes them.
 *
 * Deliberately dependency-free: winston/pino add nothing here beyond this
 * ~90-line straight-JSON sink, and every byte of the local console stack that
 * can rotate is one less supply-chain exposure on a machine that talks to
 * door locks.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface ErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

const LOG_DIR = path.join(os.homedir(), '.hotelia');
const LOG_FILE = path.join(LOG_DIR, 'console.log');

function createSink(): WriteStream {
  try {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    return createWriteStream(LOG_FILE, { flags: 'a', mode: 0o600 });
  } catch {
    // Degrade silently — the console must boot even if the log file can't.
    const sink = createWriteStream('/dev/null');
    void sink.write('');
    return sink;
  }
}

function serialize(entry: Omit<LogEntry, 'body'>): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({
      ts: entry.ts,
      level: entry.level,
      service: entry.service,
      pid: entry.pid,
      msg: `unserializable log entry at ${entry.ctx?.ctx ?? 'unknown'}`,
    });
  }
}

interface LogEntry {
  ts: string;
  level: LogLevel;
  service: string;
  pid: number;
  msg: string;
  ctx?: LogContext;
  err?: ErrorPayload;
}

export class Logger {
  private readonly sink: WriteStream = createSink();

  constructor(private readonly service: string) {}

  child(context: string): Logger {
    return new Logger(`${this.service}:${context}`);
  }

  private write(level: LogLevel, msg: string, ctx?: LogContext, err?: unknown): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      pid: process.pid,
      msg,
    };
    if (ctx) entry.ctx = ctx;
    if (err instanceof Error) {
      entry.err = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    } else if (err !== undefined) {
      entry.err = { name: 'unknown', message: String(err) };
    }
    this.sink.write(serialize(entry) + '\n');
    const prefix = `[${entry.ts}][${level}][${this.service}]`;
    if (level === 'error') process.stderr.write(`${prefix} ${msg}\n`);
    else if (level === 'warn') process.stderr.write(`${prefix} ${msg}\n`);
  }

  debug(msg: string, ctx?: LogContext): void {
    this.write('debug', msg, ctx);
  }
  info(msg: string, ctx?: LogContext): void {
    this.write('info', msg, ctx);
  }
  warn(msg: string, ctx?: LogContext, err?: unknown): void {
    this.write('warn', msg, ctx, err);
  }
  error(msg: string, ctx?: LogContext, err?: unknown): void {
    this.write('error', msg, ctx, err);
  }
}

/** Global console logger — import and use; cheap singleton per child(). */
export const logger = new Logger('hotelia-console');
