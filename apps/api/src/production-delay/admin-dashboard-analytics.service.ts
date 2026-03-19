import type {
  AdminDashboardChartsQuery,
  AdminDashboardChartsResponse,
  AdminDashboardMetric,
  AdminDashboardRangeKey,
  AdminDashboardRangeWindow,
  AdminDashboardStatsQuery,
  AdminDashboardStatsResponse,
} from "@bookprinta/shared";
import {
  AdminDashboardChartsQuerySchema,
  AdminDashboardStatsQuerySchema,
} from "@bookprinta/shared";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";

const ACTIVE_PRODUCTION_BOOK_STATUSES = [
  "PAYMENT_RECEIVED",
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
] as const;

const STATS_CACHE_TTL_SECONDS = 60;
const CHARTS_CACHE_TTL_SECONDS = 120;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type BucketGranularity = "day" | "month";

type ResolvedRange = {
  key: AdminDashboardRangeKey;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  granularity: BucketGranularity;
};

type TrendPoint = {
  at: string;
  revenueNgn: number;
  orders: number;
  pendingTransfers: number;
};

type SlaPoint = {
  at: string;
  under15m: number;
  between15mAnd30m: number;
  over30m: number;
};

@Injectable()
export class AdminDashboardAnalyticsService {
  private readonly logger = new Logger(AdminDashboardAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService
  ) {}

  async getDashboardStats(
    rawQuery: AdminDashboardStatsQuery
  ): Promise<AdminDashboardStatsResponse> {
    const parsedQuery = AdminDashboardStatsQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      throw new BadRequestException(parsedQuery.error.flatten());
    }

    const range = this.resolveRangeWindow(parsedQuery.data);
    const cacheKey = this.buildCacheKey("stats", range);

    const cached = await this.readCache<AdminDashboardStatsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const now = new Date();
    const slaRiskThreshold = new Date(now.getTime() - 30 * 60 * 1000);

    const [
      currentOrderCount,
      previousOrderCount,
      currentRevenue,
      previousRevenue,
      currentActiveBooks,
      previousActiveBooks,
      currentPendingTransfers,
      previousPendingTransfers,
      slaAtRiskCount,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          createdAt: { gte: range.from, lt: range.to },
        },
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: range.previousFrom, lt: range.previousTo },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          createdAt: { gte: range.from, lt: range.to },
          status: "SUCCESS",
          type: { not: "REFUND" },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          createdAt: { gte: range.previousFrom, lt: range.previousTo },
          status: "SUCCESS",
          type: { not: "REFUND" },
        },
      }),
      this.prisma.book.count({
        where: {
          status: { in: [...ACTIVE_PRODUCTION_BOOK_STATUSES] },
        },
      }),
      this.prisma.book.count({
        where: {
          status: { in: [...ACTIVE_PRODUCTION_BOOK_STATUSES] },
          createdAt: { lt: range.from },
        },
      }),
      this.prisma.payment.count({
        where: {
          provider: "BANK_TRANSFER",
          status: "AWAITING_APPROVAL",
        },
      }),
      this.prisma.payment.count({
        where: {
          provider: "BANK_TRANSFER",
          status: "AWAITING_APPROVAL",
          createdAt: { lt: range.from },
        },
      }),
      this.prisma.payment.count({
        where: {
          provider: "BANK_TRANSFER",
          status: "AWAITING_APPROVAL",
          createdAt: { lte: slaRiskThreshold },
        },
      }),
    ]);

    const payload: AdminDashboardStatsResponse = {
      totalOrders: this.buildMetric(currentOrderCount, previousOrderCount),
      totalRevenueNgn: this.buildMetric(
        this.decimalToNumber(currentRevenue._sum.amount),
        this.decimalToNumber(previousRevenue._sum.amount)
      ),
      activeBooksInProduction: this.buildMetric(currentActiveBooks, previousActiveBooks),
      pendingBankTransfers: this.buildMetric(currentPendingTransfers, previousPendingTransfers),
      slaAtRiskCount,
      range: this.serializeRangeWindow(range),
      lastUpdatedAt: now.toISOString(),
    };

    await this.writeCache(cacheKey, payload, STATS_CACHE_TTL_SECONDS);
    return payload;
  }

  async getDashboardCharts(
    rawQuery: AdminDashboardChartsQuery
  ): Promise<AdminDashboardChartsResponse> {
    const parsedQuery = AdminDashboardChartsQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      throw new BadRequestException(parsedQuery.error.flatten());
    }

    const range = this.resolveRangeWindow(parsedQuery.data);
    const cacheKey = this.buildCacheKey("charts", range);

    const cached = await this.readCache<AdminDashboardChartsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const [orderRows, paymentRows, orderStatusRows, paymentMethodRows] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: { createdAt: true },
      }),
      this.prisma.payment.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: {
          createdAt: true,
          approvedAt: true,
          amount: true,
          provider: true,
          status: true,
          type: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ["status"],
        where: { createdAt: { gte: range.from, lt: range.to } },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ["provider"],
        where: {
          createdAt: { gte: range.from, lt: range.to },
          status: "SUCCESS",
          type: { not: "REFUND" },
        },
        _count: { _all: true },
      }),
    ]);

    const trendBuckets = this.createTrendBuckets(range);
    const slaBuckets = this.createSlaBuckets(range);

    for (const row of orderRows) {
      const key = this.toBucketKey(row.createdAt, range.granularity);
      const trend = trendBuckets.get(key);
      if (trend) {
        trend.orders += 1;
      }
    }

    const now = new Date();
    for (const row of paymentRows) {
      const key = this.toBucketKey(row.createdAt, range.granularity);
      const trend = trendBuckets.get(key);
      const sla = slaBuckets.get(key);

      if (trend && row.provider === "BANK_TRANSFER" && row.status === "AWAITING_APPROVAL") {
        trend.pendingTransfers += 1;
      }

      if (trend && row.status === "SUCCESS" && row.type !== "REFUND") {
        trend.revenueNgn += this.decimalToNumber(row.amount);
      }

      if (sla && row.provider === "BANK_TRANSFER") {
        const elapsedMinutes = this.minutesBetween(row.createdAt, row.approvedAt ?? now);
        if (elapsedMinutes < 15) {
          sla.under15m += 1;
        } else if (elapsedMinutes <= 30) {
          sla.between15mAnd30m += 1;
        } else {
          sla.over30m += 1;
        }
      }
    }

    const payload: AdminDashboardChartsResponse = {
      revenueAndOrdersTrend: Array.from(trendBuckets.values()),
      paymentMethodDistribution: paymentMethodRows.map((row) => ({
        label: row.provider,
        value: row._count._all,
      })),
      orderStatusDistribution: orderStatusRows.map((row) => ({
        label: row.status,
        value: row._count._all,
      })),
      bankTransferSlaTrend: Array.from(slaBuckets.values()),
      range: this.serializeRangeWindow(range),
      refreshedAt: now.toISOString(),
    };

    await this.writeCache(cacheKey, payload, CHARTS_CACHE_TTL_SECONDS);
    return payload;
  }

  private resolveRangeWindow(query: {
    range: AdminDashboardRangeKey;
    from?: string;
    to?: string;
  }): ResolvedRange {
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
    const granularity: BucketGranularity =
      query.range === "12m" || durationMs > 120 * DAY_IN_MS ? "month" : "day";

    return {
      key: query.range,
      from,
      to,
      previousFrom,
      previousTo,
      granularity,
    };
  }

  private subtractRange(reference: Date, range: Exclude<AdminDashboardRangeKey, "custom">): Date {
    const next = new Date(reference.getTime());

    if (range === "7d") {
      return new Date(next.getTime() - 7 * DAY_IN_MS);
    }

    if (range === "30d") {
      return new Date(next.getTime() - 30 * DAY_IN_MS);
    }

    if (range === "90d") {
      return new Date(next.getTime() - 90 * DAY_IN_MS);
    }

    next.setUTCMonth(next.getUTCMonth() - 12);
    return next;
  }

  private buildMetric(currentValue: number, previousValue: number): AdminDashboardMetric {
    const deltaPercent =
      previousValue === 0
        ? currentValue === 0
          ? 0
          : null
        : this.roundTo(((currentValue - previousValue) / previousValue) * 100, 1);

    return {
      value: this.roundTo(currentValue, 2),
      deltaPercent,
    };
  }

  private decimalToNumber(value: unknown): number {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (value && typeof value === "object" && "toString" in value) {
      const parsed = Number(String(value));
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private serializeRangeWindow(range: ResolvedRange): AdminDashboardRangeWindow {
    return {
      key: range.key,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      previousFrom: range.previousFrom.toISOString(),
      previousTo: range.previousTo.toISOString(),
    };
  }

  private buildCacheKey(scope: "stats" | "charts", range: ResolvedRange): string {
    return [
      "admin-dashboard-analytics",
      scope,
      "v1",
      range.key,
      range.from.toISOString(),
      range.to.toISOString(),
      range.granularity,
    ].join(":");
  }

  private async readCache<T>(key: string): Promise<T | null> {
    const client = this.redisService.getClient();
    if (!client || !this.redisService.isAvailable()) {
      return null;
    }

    try {
      const raw = await client.get(key);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`Failed to read analytics cache for key ${key}`, error as Error);
      return null;
    }
  }

  private async writeCache<T>(key: string, payload: T, ttlSeconds: number): Promise<void> {
    const client = this.redisService.getClient();
    if (!client || !this.redisService.isAvailable()) {
      return;
    }

    try {
      await client.set(key, JSON.stringify(payload), "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn(`Failed to write analytics cache for key ${key}`, error as Error);
    }
  }

  private createTrendBuckets(range: ResolvedRange): Map<string, TrendPoint> {
    const bucketStarts = this.buildBucketStarts(range.from, range.to, range.granularity);

    return new Map(
      bucketStarts.map((date) => {
        const key = this.toBucketKey(date, range.granularity);
        return [
          key,
          {
            at: date.toISOString(),
            revenueNgn: 0,
            orders: 0,
            pendingTransfers: 0,
          },
        ];
      })
    );
  }

  private createSlaBuckets(range: ResolvedRange): Map<string, SlaPoint> {
    const bucketStarts = this.buildBucketStarts(range.from, range.to, range.granularity);

    return new Map(
      bucketStarts.map((date) => {
        const key = this.toBucketKey(date, range.granularity);
        return [
          key,
          {
            at: date.toISOString(),
            under15m: 0,
            between15mAnd30m: 0,
            over30m: 0,
          },
        ];
      })
    );
  }

  private buildBucketStarts(from: Date, to: Date, granularity: BucketGranularity): Date[] {
    const buckets: Date[] = [];
    const cursor = this.floorToBucket(from, granularity);

    while (cursor < to) {
      buckets.push(new Date(cursor.getTime()));
      if (granularity === "day") {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      } else {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    return buckets;
  }

  private floorToBucket(value: Date, granularity: BucketGranularity): Date {
    if (granularity === "month") {
      return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
    }

    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0)
    );
  }

  private toBucketKey(value: Date, granularity: BucketGranularity): string {
    const floored = this.floorToBucket(value, granularity);
    return floored.toISOString();
  }

  private minutesBetween(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (60 * 1000);
  }

  private roundTo(value: number, precision: number): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
}
