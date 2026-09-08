import type { IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';
import { logger } from './logger';

/**
 * Standardized, type-safe envelope for every renderer → main IPC call.
 *
 * Security-relevant properties:
 *  - EVERY handler validates its raw payload against a Zod schema BEFORE any
 *    business logic runs (`wrapIpc`). Invalid shapes return a
 *    `VALIDATION_FAILED` error and never touch the DB, the SQLite store, or
 *    the hardware bridge.
 *  - Errors never leak raw stack traces to the renderer: only `err.message`.
 *    Detail (stack, ctx) goes to the structured local logger (see logger.ts).
 *  - The wrapper guarantees the renderer can always call
 *    `await handler(...)` without an unhandled-rejection path crashing the
 *    webContents — `{ success: false, error }` is thrown only on log failure,
 *    never as an IPC crash.
 */

export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export const ok = <T>(data: T): CommandResult<T> => ({ success: true, data });
export const fail = <T>(error: string): CommandResult<T> => ({ success: false, error });

export class IpcValidationError extends Error {}
export class DbUnavailableError extends Error {
  constructor(message: string) {
    super(`DATABASE_UNAVAILABLE: ${message}`);
    this.name = 'DbUnavailableError';
  }
}

/**
 * Wrap an `ipcMain.handle` implementation with schema validation + global
 * error handling. The returned function is the exact signature Electron
 * expects from `ipcMain.handle`.
 *
 * @param ctx      logical channel name printed in logs (e.g. "sync:enqueue")
 * @param schema   Zod schema the arbitrary `raw` payload must satisfy
 * @param run      validated, fully-typed business logic
 */
export function wrapIpc<TInput, TResult>(
  ctx: string,
  schema: ZodType<TInput>,
  run: (input: TInput) => TResult | Promise<TResult>,
): (event: IpcMainInvokeEvent, raw: unknown) => Promise<CommandResult<TResult>> {
  return async (event: IpcMainInvokeEvent, raw: unknown): Promise<CommandResult<TResult>> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      logger.warn('ipc:validation-failed', { ctx, detail });
      return fail(`VALIDATION_FAILED: ${detail || 'malformed payload'}`);
    }

    try {
      const data = await run(parsed.data);
      return ok(data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('ipc:handler-error', { ctx, success: false }, e);
      return fail(e.message || 'UNKNOWN_HANDLER_ERROR');
    }
  };
}
