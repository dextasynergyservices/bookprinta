import { createRequire } from "node:module";
import { Logger } from "@nestjs/common";

/**
 * RedisCommandMeter — Phase 0 baseline instrumentation.
 *
 * Counts every Redis command issued by this process, broken down by command
 * name, so we can attribute Upstash consumption to a concrete source before
 * refactoring anything (see docs/infra-cost-hardening-plan.md, Phase 0).
 *
 * ─── Why this patches MORE THAN ONE ioredis copy ──────────────────────────
 *
 * The dependency tree currently resolves three distinct ioredis versions:
 *
 *   apps/api        → ioredis@5.10.0
 *   bullmq@5.70.1   → ioredis@5.9.3
 *
 * Each copy is a separate module instance with its own `Redis.prototype`.
 * Patching only the copy that `import "ioredis"` resolves would count the
 * cache/session traffic and MISS every BullMQ command — which is exactly the
 * traffic this baseline exists to measure.
 *
 * So we resolve ioredis from both this package's context and BullMQ's own
 * context, dedupe by prototype identity, and patch each distinct prototype.
 * `getSnapshot().patchedCopies` reports what was actually instrumented; if it
 * lists fewer copies than expected, the numbers are incomplete and must not be
 * treated as a baseline.
 *
 * ─── Safety ───────────────────────────────────────────────────────────────
 *
 * - Opt-in only. Does nothing unless REDIS_COMMAND_METER=1.
 * - The patch increments an in-memory counter then delegates to the original
 *   implementation unchanged. No behavioural difference, no added I/O.
 * - Idempotent: a prototype is never patched twice.
 * - Temporary. Remove once Phase 1 is verified against the baseline.
 */

const logger = new Logger("RedisCommandMeter");

const PATCH_FLAG = "__bookprintaCommandMeterPatched";

type SendCommandFn = (this: unknown, command: unknown, ...rest: unknown[]) => unknown;

type PatchableRedisPrototype = {
  sendCommand?: SendCommandFn;
  [PATCH_FLAG]?: boolean;
};

export type RedisCommandMeterSnapshot = {
  enabled: boolean;
  /** ioredis copies that were successfully instrumented. */
  patchedCopies: string[];
  /**
   * True when BullMQ's own ioredis copy was instrumented. When false, queue
   * traffic is missing from these counts and the snapshot is NOT a valid
   * baseline — consumers should refuse to record it.
   */
  bullmqInstrumented: boolean;
  startedAt: string | null;
  observedMs: number;
  totalCommands: number;
  /** Per-command counts, highest first. */
  byCommand: Array<{ command: string; count: number; perDay: number }>;
  /** Straight-line extrapolations — only meaningful once observedMs is hours, not seconds. */
  projected: {
    perDay: number;
    per30Days: number;
  };
};

let enabled = false;
let startedAtMs: number | null = null;
let bullmqCopyInstrumented = false;
const patchedCopies: string[] = [];
const counts = new Map<string, number>();

function record(commandName: string): void {
  counts.set(commandName, (counts.get(commandName) ?? 0) + 1);
}

/**
 * Patch a single ioredis prototype. Returns true if this call performed the
 * patch, false if it was already patched or is not patchable.
 */
function patchPrototype(prototype: PatchableRedisPrototype, label: string): boolean {
  if (prototype[PATCH_FLAG]) return false;

  const original = prototype.sendCommand;
  if (typeof original !== "function") {
    logger.warn(`Could not instrument ${label} — sendCommand is not a function`);
    return false;
  }

  prototype.sendCommand = function patchedSendCommand(
    this: unknown,
    command: unknown,
    ...rest: unknown[]
  ) {
    // `command.name` is ioredis's own field for the Redis verb (get, evalsha,
    // bzpopmin, ...). Guard defensively — a miscount must never break a command.
    try {
      const name =
        typeof command === "object" && command !== null && "name" in command
          ? String((command as { name?: unknown }).name ?? "unknown")
          : "unknown";
      record(name.toLowerCase());
    } catch {
      // Counting is best-effort and must never interfere with Redis traffic.
    }

    return original.call(this, command, ...rest);
  };

  prototype[PATCH_FLAG] = true;
  patchedCopies.push(label);
  return true;
}

/**
 * Seeds from which to start module resolution.
 *
 * We deliberately avoid `import.meta.url` — it is a syntax error under Jest's
 * CommonJS transform and this file is imported transitively by specs. Instead we
 * try several seeds and take the union of whatever distinct ioredis copies they
 * turn up. Patching extra copies is harmless (the patch is idempotent and
 * deduped by prototype identity); patching too few is not, so breadth wins.
 *
 * Seeding matters: resolution walks up from the seed's directory, so a seed
 * outside the project tree can resolve a completely unrelated ioredis (e.g. a
 * global package-manager cache). `patchedCopies` in the snapshot reports what was
 * actually instrumented so callers can detect that case rather than trusting
 * silently-incomplete numbers.
 */
function resolutionSeeds(): string[] {
  const seeds = [process.argv[1], `${process.cwd()}/package.json`].filter(
    (seed): seed is string => typeof seed === "string" && seed.length > 0
  );

  return [...new Set(seeds)];
}

/**
 * Resolve the ioredis module that a given package sees, so we can patch the
 * exact copy BullMQ uses rather than assuming a deduped tree.
 *
 * `fromModuleId === null` resolves ioredis directly from the seed's context.
 */
function resolveIoredis(
  seed: string,
  fromModuleId: string | null
): { path: string; module: unknown } | null {
  try {
    const base = createRequire(seed);
    const resolver = fromModuleId === null ? base : createRequire(base.resolve(fromModuleId));

    const ioredisPath = resolver.resolve("ioredis");
    return { path: ioredisPath, module: resolver("ioredis") };
  } catch (error) {
    logger.debug?.(
      `Could not resolve ioredis via "${fromModuleId ?? "self"}" from seed "${seed}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

/**
 * ioredis exports the client both as a named `Redis` export and as the CJS
 * module root depending on version and interop path. Try both.
 */
function extractRedisPrototype(mod: unknown): PatchableRedisPrototype | null {
  const candidates: unknown[] = [];
  if (typeof mod === "function") candidates.push(mod);
  if (typeof mod === "object" && mod !== null) {
    const record = mod as Record<string, unknown>;
    if (typeof record.Redis === "function") candidates.push(record.Redis);
    if (typeof record.default === "function") candidates.push(record.default);
  }

  for (const candidate of candidates) {
    const prototype = (candidate as { prototype?: PatchableRedisPrototype }).prototype;
    if (prototype && typeof prototype.sendCommand === "function") {
      return prototype;
    }
  }

  return null;
}

/**
 * Install the meter. Call once, as early in bootstrap as possible — commands
 * issued before installation are not counted.
 *
 * No-ops unless REDIS_COMMAND_METER=1.
 */
export function installRedisCommandMeter(): void {
  if (process.env.REDIS_COMMAND_METER !== "1") return;
  if (enabled) return;

  // Both consumers of Redis in this process. `null` is our own copy (cache,
  // sessions, pub/sub); "bullmq" is the copy that matters for the idle-cost
  // thesis and is a DIFFERENT ioredis version — see the file header.
  const targets: Array<string | null> = [null, "bullmq"];
  const seenPrototypes = new Set<PatchableRedisPrototype>();

  for (const seed of resolutionSeeds()) {
    for (const target of targets) {
      const resolved = resolveIoredis(seed, target);
      if (!resolved) continue;

      const prototype = extractRedisPrototype(resolved.module);
      if (!prototype || seenPrototypes.has(prototype)) continue;
      seenPrototypes.add(prototype);

      patchPrototype(prototype, resolved.path);
      if (target === "bullmq") bullmqCopyInstrumented = true;
    }
  }

  if (patchedCopies.length === 0) {
    logger.error("REDIS_COMMAND_METER=1 but no ioredis copy could be instrumented");
    return;
  }

  enabled = true;
  startedAtMs = Date.now();

  logger.warn(
    `Redis command meter ACTIVE — instrumenting ${patchedCopies.length} ioredis ` +
      `${patchedCopies.length === 1 ? "copy" : "copies"}. This is temporary Phase 0 ` +
      "instrumentation; disable REDIS_COMMAND_METER once the baseline is captured."
  );
  for (const copy of patchedCopies) {
    logger.log(`  instrumented: ${copy}`);
  }

  // The whole point of this meter is attributing BullMQ's idle polling. If we
  // could not reach BullMQ's ioredis copy, the numbers will look reassuringly
  // small and be badly wrong — so say so loudly rather than quietly under-report.
  if (!bullmqCopyInstrumented) {
    logger.error(
      "Could NOT instrument BullMQ's ioredis copy — queue traffic will be MISSING " +
        "from these counts. Do not treat the result as a baseline."
    );
  }
}

export function getRedisCommandMeterSnapshot(): RedisCommandMeterSnapshot {
  const observedMs = startedAtMs === null ? 0 : Date.now() - startedAtMs;
  const perDayFactor = observedMs > 0 ? 86_400_000 / observedMs : 0;

  let totalCommands = 0;
  for (const count of counts.values()) totalCommands += count;

  const byCommand = [...counts.entries()]
    .map(([command, count]) => ({
      command,
      count,
      perDay: Math.round(count * perDayFactor),
    }))
    .sort((a, b) => b.count - a.count);

  const perDay = Math.round(totalCommands * perDayFactor);

  return {
    enabled,
    patchedCopies: [...patchedCopies],
    bullmqInstrumented: bullmqCopyInstrumented,
    startedAt: startedAtMs === null ? null : new Date(startedAtMs).toISOString(),
    observedMs,
    totalCommands,
    byCommand,
    projected: {
      perDay,
      per30Days: perDay * 30,
    },
  };
}

/** Clear counters and restart the observation window. Used between capture runs. */
export function resetRedisCommandMeter(): void {
  counts.clear();
  if (enabled) startedAtMs = Date.now();
}
