import type {
  AdminDashboardRangeKey,
  WebAnalyticsCustomEventsResponse,
  WebAnalyticsDevicesResponse,
  WebAnalyticsFunnelResponse,
  WebAnalyticsGeographyResponse,
  WebAnalyticsOverview,
  WebAnalyticsPagesResponse,
  WebAnalyticsQuery,
  WebAnalyticsReferrersResponse,
  WebAnalyticsVisitorsResponse,
  WebLiveVisitors,
} from "@bookprinta/shared";
import { HttpService } from "@nestjs/axios";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service.js";
import type { PostHogHogQLResponse, PostHogQueryPayload } from "./types/posthog-responses.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const CACHE_TTL = {
  overview: 300, // 5 min
  pages: 600, // 10 min
  visitors: 600, // 10 min
  referrers: 1800, // 30 min
  geography: 1800, // 30 min
  devices: 1800, // 30 min
  funnel: 600, // 10 min
  customEvents: 600, // 10 min
  liveVisitors: 30, // 30 sec
} as const;

const CUSTOM_EVENTS = [
  "package_selected",
  "configuration_completed",
  "checkout_started",
  "payment_completed",
  "quote_submitted",
  "manuscript_uploaded",
  "book_approved",
] as const;

const FUNNEL_STEPS = [
  { name: "Landing", event: "$pageview", filter: "" },
  { name: "Pricing", event: "$pageview", filter: "AND properties.$current_url LIKE '%/pricing%'" },
  { name: "Checkout", event: "checkout_started", filter: "" },
  { name: "Payment", event: "payment_completed", filter: "" },
] as const;

type ResolvedRange = {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  granularity: "day" | "month";
};

@Injectable()
export class WebAnalyticsService {
  private readonly logger = new Logger(WebAnalyticsService.name);
  private readonly baseUrl: string;
  private readonly projectId: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly redisService: RedisService
  ) {
    this.baseUrl = (process.env.POSTHOG_HOST || "").replace(/\/+$/, "");
    this.projectId = process.env.POSTHOG_PROJECT_ID || "";
    this.apiKey = process.env.POSTHOG_PERSONAL_API_KEY || "";
    this.enabled = Boolean(this.baseUrl && this.projectId && this.apiKey);

    if (!this.enabled) {
      this.logger.warn(
        "PostHog analytics disabled — POSTHOG_HOST, POSTHOG_PROJECT_ID, or POSTHOG_PERSONAL_API_KEY is not set."
      );
    }
  }

  // ─── Public Query Methods ──────────────────────────────────────────

  async getOverview(query: WebAnalyticsQuery): Promise<WebAnalyticsOverview> {
    const range = this.resolveRange(query);
    const cacheKey = this.cacheKey("overview", range);
    const cached = await this.getFromCache<WebAnalyticsOverview>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);
    const prevFromStr = this.toIso(range.previousFrom);
    const prevToStr = this.toIso(range.previousTo);

    const [visitors, pageviews, sessions, prevVisitors, prevPageviews] = await Promise.all([
      this.queryScalar(
        `SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'`
      ),
      this.queryScalar(
        `SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'`
      ),
      this.queryScalar(
        `SELECT count(DISTINCT "$session_id") FROM events WHERE timestamp >= '${fromStr}' AND timestamp <= '${toStr}'`
      ),
      this.queryScalar(
        `SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND timestamp >= '${prevFromStr}' AND timestamp <= '${prevToStr}'`
      ),
      this.queryScalar(
        `SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= '${prevFromStr}' AND timestamp <= '${prevToStr}'`
      ),
    ]);

    const result: WebAnalyticsOverview = {
      uniqueVisitors: visitors,
      totalPageviews: pageviews,
      totalSessions: sessions,
      avgSessionDuration: null,
      bounceRate: null,
      deltaVisitors: this.deltaPercent(visitors, prevVisitors),
      deltaPageviews: this.deltaPercent(pageviews, prevPageviews),
    };

    await this.setCache(cacheKey, result, CACHE_TTL.overview);
    return result;
  }

  async getTopPages(
    query: WebAnalyticsQuery & { limit?: number }
  ): Promise<WebAnalyticsPagesResponse> {
    const range = this.resolveRange(query);
    const limit = Math.min(query.limit ?? 20, 100);
    const cacheKey = this.cacheKey("pages", range, String(limit));
    const cached = await this.getFromCache<WebAnalyticsPagesResponse>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);

    const rows = await this.queryRows(
      `SELECT properties.$current_url AS page, count() AS views, count(DISTINCT person_id) AS unique_visitors
       FROM events
       WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
       GROUP BY page ORDER BY views DESC LIMIT ${limit}`
    );

    const result: WebAnalyticsPagesResponse = {
      items: rows.map((row) => ({
        page: String(row[0] ?? ""),
        views: Number(row[1] ?? 0),
        uniqueVisitors: Number(row[2] ?? 0),
      })),
      total: rows.length,
    };

    await this.setCache(cacheKey, result, CACHE_TTL.pages);
    return result;
  }

  async getVisitorTrend(query: WebAnalyticsQuery): Promise<WebAnalyticsVisitorsResponse> {
    const range = this.resolveRange(query);
    const cacheKey = this.cacheKey("visitors", range);
    const cached = await this.getFromCache<WebAnalyticsVisitorsResponse>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);
    const truncFn = range.granularity === "month" ? "toStartOfMonth" : "toStartOfDay";

    const rows = await this.queryRows(
      `SELECT ${truncFn}(timestamp) AS bucket,
              count(DISTINCT person_id) AS visitors,
              count() AS pageviews,
              count(DISTINCT "$session_id") AS sessions
       FROM events
       WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
       GROUP BY bucket ORDER BY bucket ASC`
    );

    const result: WebAnalyticsVisitorsResponse = {
      points: rows.map((row) => ({
        date: String(row[0] ?? ""),
        visitors: Number(row[1] ?? 0),
        pageviews: Number(row[2] ?? 0),
        sessions: Number(row[3] ?? 0),
      })),
    };

    await this.setCache(cacheKey, result, CACHE_TTL.visitors);
    return result;
  }

  async getReferrers(query: WebAnalyticsQuery): Promise<WebAnalyticsReferrersResponse> {
    const range = this.resolveRange(query);
    const cacheKey = this.cacheKey("referrers", range);
    const cached = await this.getFromCache<WebAnalyticsReferrersResponse>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);

    const rows = await this.queryRows(
      `SELECT coalesce(properties.$referrer, '(direct)') AS source,
              count(DISTINCT person_id) AS visitors
       FROM events
       WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
       GROUP BY source ORDER BY visitors DESC LIMIT 20`
    );

    const totalVisitors = rows.reduce((sum, row) => sum + Number(row[1] ?? 0), 0);

    // Aggregate duplicates after simplification (e.g. multiple localhost URLs → "localhost")
    const aggregated = new Map<string, number>();
    for (const row of rows) {
      const source = simplifyReferrer(String(row[0] ?? ""));
      const visitors = Number(row[1] ?? 0);
      aggregated.set(source, (aggregated.get(source) ?? 0) + visitors);
    }

    const result: WebAnalyticsReferrersResponse = {
      items: Array.from(aggregated.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([source, visitors]) => ({
          source,
          visitors,
          percentage: totalVisitors > 0 ? round((visitors / totalVisitors) * 100) : 0,
        })),
    };

    await this.setCache(cacheKey, result, CACHE_TTL.referrers);
    return result;
  }

  async getGeography(query: WebAnalyticsQuery): Promise<WebAnalyticsGeographyResponse> {
    const range = this.resolveRange(query);
    const cacheKey = this.cacheKey("geography", range);
    const cached = await this.getFromCache<WebAnalyticsGeographyResponse>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);

    const rows = await this.queryRows(
      `SELECT properties.$geoip_country_name AS country,
              properties.$geoip_country_code AS country_code,
              count(DISTINCT person_id) AS visitors
       FROM events
       WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
       GROUP BY country, country_code ORDER BY visitors DESC LIMIT 20`
    );

    const totalVisitors = rows.reduce((sum, row) => sum + Number(row[2] ?? 0), 0);
    const result: WebAnalyticsGeographyResponse = {
      items: rows.map((row) => ({
        country: String(row[0] ?? "Unknown"),
        countryCode: String(row[1] ?? ""),
        visitors: Number(row[2] ?? 0),
        percentage: totalVisitors > 0 ? round((Number(row[2] ?? 0) / totalVisitors) * 100) : 0,
      })),
    };

    await this.setCache(cacheKey, result, CACHE_TTL.geography);
    return result;
  }

  async getDevices(query: WebAnalyticsQuery): Promise<WebAnalyticsDevicesResponse> {
    const range = this.resolveRange(query);
    const cacheKey = this.cacheKey("devices", range);
    const cached = await this.getFromCache<WebAnalyticsDevicesResponse>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);

    const [deviceRows, browserRows, osRows] = await Promise.all([
      this.queryRows(
        `SELECT properties.$device_type AS category, count() AS cnt
         FROM events WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
         GROUP BY category ORDER BY cnt DESC`
      ),
      this.queryRows(
        `SELECT properties.$browser AS category, count() AS cnt
         FROM events WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
         GROUP BY category ORDER BY cnt DESC LIMIT 10`
      ),
      this.queryRows(
        `SELECT properties.$os AS category, count() AS cnt
         FROM events WHERE event = '$pageview' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
         GROUP BY category ORDER BY cnt DESC LIMIT 10`
      ),
    ]);

    const result: WebAnalyticsDevicesResponse = {
      deviceTypes: toDeviceEntries(deviceRows),
      browsers: toDeviceEntries(browserRows),
      operatingSystems: toDeviceEntries(osRows),
    };

    await this.setCache(cacheKey, result, CACHE_TTL.devices);
    return result;
  }

  async getFunnel(query: WebAnalyticsQuery): Promise<WebAnalyticsFunnelResponse> {
    const range = this.resolveRange(query);
    const cacheKey = this.cacheKey("funnel", range);
    const cached = await this.getFromCache<WebAnalyticsFunnelResponse>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);

    const counts = await Promise.all(
      FUNNEL_STEPS.map((step) =>
        this.queryScalar(
          `SELECT count(DISTINCT person_id)
           FROM events
           WHERE event = '${step.event}'
           AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
           ${step.filter}`
        )
      )
    );

    const topCount = counts[0] || 1;
    const steps = FUNNEL_STEPS.map((step, i) => {
      const count = counts[i];
      const percentage = round((count / topCount) * 100);
      const prevCount = i === 0 ? count : counts[i - 1];
      const dropoff = prevCount > 0 ? round(((prevCount - count) / prevCount) * 100) : 0;
      return { step: step.name, count, percentage, dropoff };
    });

    const result: WebAnalyticsFunnelResponse = { steps };
    await this.setCache(cacheKey, result, CACHE_TTL.funnel);
    return result;
  }

  async getCustomEvents(query: WebAnalyticsQuery): Promise<WebAnalyticsCustomEventsResponse> {
    const range = this.resolveRange(query);
    const cacheKey = this.cacheKey("custom-events", range);
    const cached = await this.getFromCache<WebAnalyticsCustomEventsResponse>(cacheKey);
    if (cached) return cached;

    const fromStr = this.toIso(range.from);
    const toStr = this.toIso(range.to);
    const eventList = CUSTOM_EVENTS.map((e) => `'${e}'`).join(", ");

    const rows = await this.queryRows(
      `SELECT event, count() AS cnt, count(DISTINCT person_id) AS unique_users
       FROM events
       WHERE event IN (${eventList})
       AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}'
       GROUP BY event ORDER BY cnt DESC`
    );

    const result: WebAnalyticsCustomEventsResponse = {
      items: rows.map((row) => ({
        event: String(row[0] ?? ""),
        count: Number(row[1] ?? 0),
        uniqueUsers: Number(row[2] ?? 0),
      })),
    };

    await this.setCache(cacheKey, result, CACHE_TTL.customEvents);
    return result;
  }

  // ─── Live Visitors ─────────────────────────────────────────────────

  async getLiveVisitors(): Promise<WebLiveVisitors> {
    const cacheKey = "posthog:live-visitors";
    const cached = await this.getFromCache<WebLiveVisitors>(cacheKey);
    if (cached) return cached;

    const count = await this.queryScalar(
      `SELECT count(DISTINCT person_id)
       FROM events
       WHERE event = '$pageview'
       AND timestamp >= now() - toIntervalMinute(5)`
    );

    const result: WebLiveVisitors = {
      activeVisitors: count,
      queriedAt: new Date().toISOString(),
    };

    await this.setCache(cacheKey, result, CACHE_TTL.liveVisitors);
    return result;
  }

  // ─── PostHog HogQL Query Execution ─────────────────────────────────

  private async queryRows(hogql: string): Promise<unknown[][]> {
    if (!this.enabled) return [];

    try {
      const payload: PostHogQueryPayload = {
        query: { kind: "HogQLQuery", query: hogql },
      };

      const { data } = await this.httpService.axiosRef.post<PostHogHogQLResponse>(
        `${this.baseUrl}/api/projects/${this.projectId}/query`,
        payload,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: 15_000,
        }
      );

      return data.results ?? [];
    } catch (error) {
      this.logger.error(
        `PostHog HogQL query failed: ${error instanceof Error ? error.message : "unknown"}`,
        error instanceof Error ? error.stack : undefined
      );
      return [];
    }
  }

  private async queryScalar(hogql: string): Promise<number> {
    const rows = await this.queryRows(hogql);
    return Number(rows[0]?.[0] ?? 0);
  }

  // ─── Range Resolution ──────────────────────────────────────────────

  private resolveRange(query: WebAnalyticsQuery): ResolvedRange {
    const now = new Date();
    let from: Date;
    let to: Date;

    if (query.range === "custom") {
      if (!query.from || !query.to) {
        throw new BadRequestException("from and to are required when range is custom");
      }
      from = new Date(query.from);
      to = new Date(query.to);
    } else {
      to = now;
      from = this.subtractRange(now, query.range);
    }

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("Invalid from/to date values");
    }
    if (to <= from) {
      throw new BadRequestException("to must be greater than from");
    }

    const durationMs = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime());
    const previousFrom = new Date(from.getTime() - durationMs);
    const granularity: "day" | "month" =
      query.range === "12m" || durationMs > 120 * DAY_IN_MS ? "month" : "day";

    return { from, to, previousFrom, previousTo, granularity };
  }

  private subtractRange(reference: Date, range: Exclude<AdminDashboardRangeKey, "custom">): Date {
    if (range === "7d") return new Date(reference.getTime() - 7 * DAY_IN_MS);
    if (range === "30d") return new Date(reference.getTime() - 30 * DAY_IN_MS);
    if (range === "90d") return new Date(reference.getTime() - 90 * DAY_IN_MS);
    const next = new Date(reference.getTime());
    next.setUTCMonth(next.getUTCMonth() - 12);
    return next;
  }

  // ─── Caching ───────────────────────────────────────────────────────

  private cacheKey(prefix: string, range: ResolvedRange, extra = ""): string {
    return `posthog:${prefix}:${this.toIso(range.from)}_${this.toIso(range.to)}${extra ? `:${extra}` : ""}`;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    const client = this.redisService.getClient();
    if (!client) return null;
    try {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    try {
      await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Cache failures are non-critical — log but don't throw
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private deltaPercent(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : 100;
    return round(((current - previous) / previous) * 100);
  }

  private toIso(date: Date): string {
    // PostHog HogQL expects ClickHouse datetime format: 'YYYY-MM-DD HH:MM:SS'
    return date
      .toISOString()
      .replace("T", " ")
      .replace("Z", "")
      .replace(/\.\d{3}$/, "");
  }
}

// ─── Module-Level Helpers ──────────────────────────────────────────────────

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function simplifyReferrer(raw: string): string {
  if (!raw || raw === "(direct)") return "Direct";
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

function toDeviceEntries(
  rows: unknown[][]
): { category: string; count: number; percentage: number }[] {
  const total = rows.reduce((sum, row) => sum + Number(row[1] ?? 0), 0);
  return rows.map((row) => ({
    category: String(row[0] ?? "Unknown"),
    count: Number(row[1] ?? 0),
    percentage: total > 0 ? round((Number(row[1] ?? 0) / total) * 100) : 0,
  }));
}
