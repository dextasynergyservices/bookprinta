import * as bcrypt from "bcrypt";

/**
 * Password hashing tuned for the instance it runs on.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * bcrypt cost 12 is ~250 ms of CPU on a full core. On Render's free tier
 * (0.1 CPU) the pressure test measured ~2.7 s per login, and a burst of 15
 * logins starved every other request on the instance (p99 41 s, DB pool
 * acquire timeouts). Two changes:
 *
 *  1. The cost is configurable (BCRYPT_COST), default 10 — OWASP's minimum
 *     for bcrypt and 4× cheaper. Set 12 once the API has a dedicated CPU.
 *     Existing hashes keep verifying at whatever cost they were made with, and
 *     `needsRehash` lets login migrate them to the configured cost.
 *  2. At most BCRYPT_MAX_CONCURRENCY hash/compare operations run at once
 *     (default 1). Parallel bcrypt gains nothing on a fractional CPU — it only
 *     takes CPU share from the event loop — so extra logins queue briefly
 *     instead of freezing the whole API.
 */

const MIN_COST = 10;
const MAX_COST = 14;

export function resolveBcryptCost(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.BCRYPT_COST ?? "", 10);
  if (!Number.isFinite(parsed)) return MIN_COST;
  return Math.min(MAX_COST, Math.max(MIN_COST, parsed));
}

function resolveMaxConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.BCRYPT_MAX_CONCURRENCY ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

let active = 0;
const waiting: Array<() => void> = [];

/** Run `task` once a bcrypt slot is free. Exported for tests. */
export async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= resolveMaxConcurrency()) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export function hashPassword(password: string): Promise<string> {
  return withSlot(() => bcrypt.hash(password, resolveBcryptCost()));
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return withSlot(() => bcrypt.compare(password, hash));
}

/** True when a stored hash was made with a different cost than configured. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) !== resolveBcryptCost();
  } catch {
    return false;
  }
}
