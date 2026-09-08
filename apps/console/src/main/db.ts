import type { Prisma as PrismaNamespace, PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { DbUnavailableError } from './ipcWrap';

/**
 * Lazy Prisma facade for the console main process.
 *
 * Critical property: importing this module NEVER touches the DB. The
 * `@hotelia/database` workspace is only `require`d on first use inside
 * `getDb()`, wrapped, and memoized — so if a deployment has no Prisma
 * engine binary / no DATABASE_URL (this sandbox, packaging defects, future
 * plugins-only installs), the console STILL boots: every `pms.*` / `pos.*`
 * IPC call returns a standardized `DATABASE_UNAVAILABLE` error instead of
 * exploding during `app.whenReady()`.
 *
 * `DATABASE_URL` is resolved, in priority order:
 *  1. `process.env.HOTELIA_DB_URL`   (explicit console override)
 *  2. `process.env.DATABASE_URL`     (shell/CI-inherited)
 *  3. root `.env`                    (loaded once by `loadDbEnv()` in index.ts)
 */

let db: PrismaClient | null = null;
let loadError: string | null = null;

export function loadDbEnv(): void {
  if (process.env.HOTELIA_DB_URL || process.env.DATABASE_URL) return;
  for (const candidate of [
    process.env.HOTELIA_CONSOLE_ROOT && `${process.env.HOTELIA_CONSOLE_ROOT}/.env`,
    `${__dirname}/../../../../.env`,
  ]) {
    if (!candidate) continue;
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      /* not present — try next candidate */
    }
  }
}

export function getDb(): PrismaClient {
  if (loadError) throw new DbUnavailableError(loadError);
  if (db) return db;
  try {
    // Reason for require() not import: defer the native query-engine load
    // until the first real DB call so a missing engine cannot brick boot.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require('@hotelia/database') as { prisma: PrismaClient };
    if (!process.env.HOTELIA_DB_URL && !process.env.DATABASE_URL) {
      // Preflight so the cal is never reached with a bare Prisma env error.
      loadError =
        'DATABASE_URL is not set — provide HOTELIA_DB_URL / DATABASE_URL, or a root .env (see loadDbEnv).';
      throw new DbUnavailableError(loadError);
    }
    db = prisma;
    logger.info('db:prisma-ready');
    return db;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    logger.error('db:unavailable', undefined, err as Error);
    throw err instanceof DbUnavailableError ? err : new DbUnavailableError(loadError);
  }
}

export function isDbAvailable(): boolean {
  return loadError === null;
}

let prismaNs: typeof PrismaNamespace | null = null;

/**
 * Lazily loaded Prisma namespace (runtime enums / JsonNull / isolation levels).
 * Kept behind a function so importing db.ts at boot never requires @prisma/client.
 */
export function getPrismaNs(): typeof PrismaNamespace {
  if (prismaNs) return prismaNs;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  prismaNs = require('@prisma/client').Prisma as typeof PrismaNamespace;
  return prismaNs;
}
