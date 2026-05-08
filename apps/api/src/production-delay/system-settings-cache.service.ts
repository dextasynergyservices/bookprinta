import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * In-memory cache for SystemSetting rows.
 *
 * System settings change extremely rarely (maybe once a month) but are
 * queried on every quote estimation, production-delay check, and reprint
 * cost calculation. Caching all rows at startup with a 5-minute TTL
 * eliminates these DB round-trips entirely.
 *
 * Design notes:
 *  - In-memory Map (not Redis) — a single network-less lookup per call.
 *  - TTL is a safety net; the cache is also invalidated explicitly after
 *    every admin PATCH /admin/system/settings/:key via invalidate().
 *  - Safe for a single-instance deployment (Render). If horizontal scaling
 *    is added later, replace with a Redis-backed cache and use Redis pub/sub
 *    to broadcast invalidations across instances.
 */
@Injectable()
export class SystemSettingsCacheService {
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  private cache: Map<string, string> = new Map();
  private refreshedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return the cached values for the requested keys.
   * Loads (or refreshes) all settings from the DB if the TTL has elapsed.
   */
  async getMany(keys: readonly string[]): Promise<Map<string, string>> {
    if (Date.now() - this.refreshedAt > SystemSettingsCacheService.TTL_MS) {
      await this.refresh();
    }

    const result = new Map<string, string>();
    for (const key of keys) {
      const value = this.cache.get(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
    return result;
  }

  /**
   * Force the cache to reload on the next call to getMany().
   * Call this after any admin mutation to a SystemSetting row.
   */
  invalidate(): void {
    this.refreshedAt = 0;
  }

  private async refresh(): Promise<void> {
    try {
      const rows = await this.prisma.systemSetting.findMany({
        select: { key: true, value: true },
      });
      const next = new Map<string, string>();
      for (const row of rows) {
        next.set(row.key, row.value);
      }
      this.cache = next;
      this.refreshedAt = Date.now();
    } catch {
      // If the DB is unavailable, keep the stale cache rather than crashing.
      // refreshedAt stays unchanged, so the next call will attempt again.
    }
  }
}
