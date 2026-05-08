import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * How many pg connections to keep open in the pool.
 *
 * Defaults to 10, which fits within Neon's free-tier limit (10 connections).
 * Override via DB_POOL_MAX env var for paid tiers (Neon Pro = up to 100).
 *
 * When using Neon's PgBouncer pooled connection string this is the number of
 * connections to PgBouncer, not to Postgres directly — set it higher (e.g. 20)
 * on paid tiers without worry about hitting the raw Postgres limit.
 *
 * CLAUDE.md Section 4.5: enable Neon connection pooling (PgBouncer) via the
 * Neon dashboard and swap DATABASE_URL to the pooled connection string for
 * the API.  This service's pool settings complement PgBouncer — they control
 * the node-postgres (pg) client-side pool, not PgBouncer itself.
 */
const DB_POOL_MAX = (() => {
  const raw = process.env.DB_POOL_MAX;
  if (!raw) return 10;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
})();

/**
 * Release idle connections after this many milliseconds (default 30 s).
 * Prevents holding open connections that Neon would time out anyway.
 */
const DB_POOL_IDLE_TIMEOUT_MS = (() => {
  const raw = process.env.DB_POOL_IDLE_TIMEOUT_MS;
  if (!raw) return 30_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
})();

/**
 * How long (ms) to wait for a connection from the pool before failing.
 * Default: 10 s.
 *
 * On Neon's free/shared tier the DB endpoint suspends after ~5 min of idle.
 * A cold Neon connection takes 1–3 s to resume.  Without a timeout the pool
 * can hang indefinitely (or until Render's 30 s proxy timeout fires, which
 * produces an opaque CORS-less error for the browser).  10 s gives Neon plenty
 * of time to wake up while still surfacing a clear error before Render's limit.
 */
const DB_CONNECTION_TIMEOUT_MS = (() => {
  const raw = process.env.DB_CONNECTION_TIMEOUT_MS;
  if (!raw) return 10_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
})();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    const adapter = new PrismaPg({
      connectionString,
      // Explicit pool sizing so Render's persistent process multiplexes
      // connections efficiently instead of relying on pg's unconstrained default.
      max: DB_POOL_MAX,
      idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT_MS,
      // Fail fast if Neon is still cold — surfaces a clear error before
      // Render's 30 s proxy timeout fires.
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(
      `Prisma connected (pool max=${DB_POOL_MAX}, idleTimeout=${DB_POOL_IDLE_TIMEOUT_MS}ms, connTimeout=${DB_CONNECTION_TIMEOUT_MS}ms)`
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
