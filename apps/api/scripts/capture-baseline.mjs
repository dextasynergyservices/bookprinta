#!/usr/bin/env node
/**
 * capture-baseline.mjs — Phase 0 baseline capture
 * (see docs/infra-cost-hardening-plan.md)
 *
 * Polls /api/v1/health/baseline over a window, writes raw JSON snapshots, and
 * prints a markdown table ready to paste into the plan's "Measured Baseline"
 * section.
 *
 * Usage:
 *   BASELINE_API_URL=https://api.bookprinta.com \
 *   BASELINE_METRICS_TOKEN=... \
 *   node scripts/capture-baseline.mjs --minutes 60 --out ./baseline
 *
 * Flags:
 *   --minutes N   Observation window in minutes (default 60)
 *   --every N     Poll interval in minutes (default 15)
 *   --out DIR     Where to write JSON snapshots (default ./baseline-capture)
 *   --reset       Reset counters before starting, for a clean window
 *
 * The script REFUSES to report a baseline when the API says BullMQ's ioredis
 * copy was not instrumented — incomplete numbers are worse than no numbers,
 * because they look plausible.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ─── Args ─────────────────────────────────────────────────────────────

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

const API_URL = (process.env.BASELINE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const TOKEN = process.env.BASELINE_METRICS_TOKEN;
const WINDOW_MINUTES = Number(flag("minutes", 60));
const POLL_MINUTES = Number(flag("every", 15));
const OUT_DIR = String(flag("out", "./baseline-capture"));
const SHOULD_RESET = flag("reset", false) === true;

if (!TOKEN) {
  console.error("BASELINE_METRICS_TOKEN is required (must match the API's env var).");
  process.exit(1);
}

if (!Number.isFinite(WINDOW_MINUTES) || WINDOW_MINUTES <= 0) {
  console.error(`--minutes must be a positive number, got "${WINDOW_MINUTES}"`);
  process.exit(1);
}

// ─── HTTP ─────────────────────────────────────────────────────────────

async function call(path, method = "GET") {
  const response = await fetch(`${API_URL}/api/v1/health/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} from /${path}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  return response.json();
}

// ─── Formatting ───────────────────────────────────────────────────────

const n = (value) => Number(value).toLocaleString("en-US");

function renderTable(snapshot) {
  const { redisCommands: redis, memory } = snapshot;
  const lines = [];

  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Observation window | ${(redis.observedMs / 60000).toFixed(1)} min |`);
  lines.push(`| Total Redis commands | ${n(redis.totalCommands)} |`);
  lines.push(`| **Projected / 24h** | **${n(redis.projected.perDay)}** |`);
  lines.push(`| **Projected / 30d** | **${n(redis.projected.per30Days)}** |`);
  lines.push(`| API peak RSS | ${memory.peakRssMb} MB |`);
  lines.push(`| API peak heap used | ${memory.peakHeapUsedMb} MB |`);
  lines.push("");
  lines.push("| Command | Count | Projected / 24h |");
  lines.push("|---|---|---|");

  for (const row of redis.byCommand) {
    lines.push(`| \`${row.command}\` | ${n(row.count)} | ${n(row.perDay)} |`);
  }

  return lines.join("\n");
}

function assessAgainstBudget(perThirtyDays) {
  const FREE_TIER = 500_000;
  const pct = Math.round((perThirtyDays / FREE_TIER) * 100);

  if (perThirtyDays > FREE_TIER) {
    return `OVER BUDGET — ${n(perThirtyDays)}/mo is ${pct}% of the ${n(FREE_TIER)} free-tier limit.`;
  }
  return `Within budget — ${n(perThirtyDays)}/mo is ${pct}% of the ${n(FREE_TIER)} free-tier limit.`;
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Capturing baseline from ${API_URL}`);
  console.log(`Window: ${WINDOW_MINUTES} min, polling every ${POLL_MINUTES} min\n`);

  await mkdir(OUT_DIR, { recursive: true });

  if (SHOULD_RESET) {
    await call("baseline/reset", "POST");
    console.log("Counters reset — starting a clean observation window.\n");
  }

  // Fail fast on a mis-instrumented API rather than after a 60-minute wait.
  const first = await call("baseline");
  if (!first.redisCommands.enabled) {
    console.error(
      "The API reports the Redis command meter is DISABLED.\n" +
        "Set REDIS_COMMAND_METER=1 on the API service and redeploy."
    );
    process.exit(1);
  }
  if (!first.redisCommands.bullmqInstrumented) {
    console.error(
      "The API could not instrument BullMQ's ioredis copy.\n" +
        "Queue traffic would be missing, so these numbers are NOT a valid baseline.\n" +
        `Instrumented copies: ${first.redisCommands.patchedCopies.join(", ") || "none"}`
    );
    process.exit(1);
  }

  console.log(`Meter active across ${first.redisCommands.patchedCopies.length} ioredis copies.`);

  const deadline = Date.now() + WINDOW_MINUTES * 60_000;
  let latest = first;
  let index = 0;

  while (Date.now() < deadline) {
    const waitMs = Math.min(POLL_MINUTES * 60_000, deadline - Date.now());
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    latest = await call("baseline");
    index += 1;

    const file = join(OUT_DIR, `snapshot-${String(index).padStart(3, "0")}.json`);
    await writeFile(file, JSON.stringify(latest, null, 2));

    console.log(
      `[${new Date().toISOString()}] ${n(latest.redisCommands.totalCommands)} commands ` +
        `(${n(latest.redisCommands.projected.perDay)}/day projected) → ${file}`
    );
  }

  const report = [
    "### Measured Baseline",
    "",
    `_Captured ${new Date().toISOString()} from ${API_URL}_`,
    "",
    renderTable(latest),
    "",
    `**Assessment:** ${assessAgainstBudget(latest.redisCommands.projected.per30Days)}`,
    "",
  ].join("\n");

  const reportPath = join(OUT_DIR, "baseline-report.md");
  await writeFile(reportPath, report);

  console.log(`\n${report}`);
  console.log(`Report written to ${reportPath}`);
  console.log("Paste the table into docs/infra-cost-hardening-plan.md under 'Measured Baseline'.");
}

main().catch((error) => {
  console.error(`\nCapture failed: ${error.message}`);
  process.exit(1);
});
