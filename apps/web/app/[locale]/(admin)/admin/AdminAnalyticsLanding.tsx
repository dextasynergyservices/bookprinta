"use client";

import type { AdminDashboardRangeKey } from "@bookprinta/shared";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Layers,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  normalizeAdminAnalyticsError,
  useAdminAnalyticsChartDatasetsQuery,
  useAdminAnalyticsKpiStatsQuery,
} from "@/hooks/useAdminAnalytics";

const RANGE_KEYS: AdminDashboardRangeKey[] = ["7d", "30d", "90d", "12m", "custom"];

function asIsoStartOfDay(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00`).toISOString();
}

function asIsoEndOfDay(dateValue: string): string {
  return new Date(`${dateValue}T23:59:59`).toISOString();
}

function formatShortDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

function formatNgn(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function useCountUp(target: number, transitionKey: string) {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    void transitionKey;

    if (prefersReducedMotion) {
      setDisplay(target);
      return;
    }

    const startValue = 0;
    const duration = 700;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplay(startValue + (target - startValue) * eased);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, transitionKey, prefersReducedMotion]);

  return display;
}

function DeltaBadge({ deltaPercent }: { deltaPercent: number | null }) {
  if (deltaPercent === null) {
    return (
      <Badge
        variant="outline"
        className="border-[#3B3B3B] bg-[#171717] text-[#A8A8A8]"
        aria-label="No trend data available"
      >
        <Minus className="mr-1 size-3" aria-hidden="true" />
        --
      </Badge>
    );
  }

  if (deltaPercent > 0) {
    return (
      <Badge
        variant="outline"
        className="border-[#1F6B3D] bg-[#0E2317] text-[#7FE0A1]"
        aria-label={`Up ${deltaPercent.toFixed(1)}% from prior period`}
      >
        <TrendingUp className="mr-1 size-3" aria-hidden="true" />+{deltaPercent.toFixed(1)}%
      </Badge>
    );
  }

  if (deltaPercent < 0) {
    return (
      <Badge
        variant="outline"
        className="border-[#7A2D2D] bg-[#2A1313] text-[#FF9C9C]"
        aria-label={`Down ${Math.abs(deltaPercent).toFixed(1)}% from prior period`}
      >
        <TrendingDown className="mr-1 size-3" aria-hidden="true" />
        {deltaPercent.toFixed(1)}%
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-[#3B3B3B] bg-[#171717] text-[#A8A8A8]"
      aria-label="No change from prior period"
    >
      <Minus className="mr-1 size-3" aria-hidden="true" />
      0.0%
    </Badge>
  );
}

type AnalyticsTooltipPayload = {
  color?: string;
  dataKey?: string | number;
  value?: number;
  name?: string;
};

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: AnalyticsTooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[#2A2A2A] bg-[#0A0A0A]/95 p-3 shadow-2xl backdrop-blur-sm">
      <p className="font-sans text-xs text-[#E2E2E2]">{label ? formatShortDate(label) : "--"}</p>
      <div className="mt-2 grid gap-1.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="font-sans text-xs text-[#AFAFAF]" style={{ color: entry.color }}>
              {entry.name ?? entry.dataKey}
            </span>
            <span className="font-sans text-xs font-medium text-white">
              {typeof entry.value === "number" ? formatCompact(entry.value) : "--"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <Skeleton className="h-5 w-52" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-5 h-[290px] rounded-xl border border-[#1A1A1A] bg-[#0B0B0B] p-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-4 h-40 w-full" />
        <div className="mt-4 grid grid-cols-4 gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
    </div>
  );
}

function WidgetError({ message }: { message: string }) {
  return (
    <div className="flex h-[290px] items-center justify-center rounded-xl border border-[#552525] bg-[#2B1313]/50 p-5 text-center">
      <div>
        <AlertTriangle className="mx-auto size-6 text-[#F2A6A6]" />
        <p className="font-sans mt-2 text-sm text-[#FFD6D6]">{message}</p>
      </div>
    </div>
  );
}

function WidgetEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[290px] items-center justify-center rounded-xl border border-[#2A2A2A] bg-[#0C0C0C] p-5 text-center">
      <p className="font-sans max-w-xs text-sm text-[#B3B3B3]">{message}</p>
    </div>
  );
}

export function AdminAnalyticsLanding() {
  const tAdmin = useTranslations("admin");
  const prefersReducedMotion = useReducedMotion();

  const [range, setRange] = useState<AdminDashboardRangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const queryInput = useMemo(() => {
    if (range !== "custom") {
      return { range };
    }

    return {
      range,
      ...(customFrom ? { from: asIsoStartOfDay(customFrom) } : {}),
      ...(customTo ? { to: asIsoEndOfDay(customTo) } : {}),
    };
  }, [range, customFrom, customTo]);

  const statsQuery = useAdminAnalyticsKpiStatsQuery(queryInput);
  const chartsQuery = useAdminAnalyticsChartDatasetsQuery(queryInput);

  const stats = statsQuery.data;
  const charts = chartsQuery.data;

  const animationSeed = `${range}-${stats.lastUpdatedAt}-${charts.refreshedAt}`;

  const ordersCount = useCountUp(stats.totalOrders.value, `orders-${animationSeed}`);
  const revenueCount = useCountUp(stats.totalRevenueNgn.value, `revenue-${animationSeed}`);
  const activeBooksCount = useCountUp(
    stats.activeBooksInProduction.value,
    `active-${animationSeed}`
  );
  const pendingTransfersCount = useCountUp(
    stats.pendingBankTransfers.value,
    `pending-${animationSeed}`
  );

  const trendData = useMemo(
    () => charts.revenueAndOrdersTrend.map((point) => ({ ...point, label: point.at })),
    [charts.revenueAndOrdersTrend]
  );

  const paymentData = useMemo(
    () => charts.paymentMethodDistribution,
    [charts.paymentMethodDistribution]
  );

  const statusData = useMemo(
    () =>
      charts.orderStatusDistribution.map((point) => ({ status: point.label, total: point.value })),
    [charts.orderStatusDistribution]
  );

  const slaData = useMemo(
    () => charts.bankTransferSlaTrend.map((point) => ({ ...point, label: point.at })),
    [charts.bankTransferSlaTrend]
  );

  const insights = useMemo(() => {
    const items: Array<{ key: string; text: string }> = [];

    if (stats.slaAtRiskCount > 0) {
      items.push({
        key: "sla-risk",
        text: tAdmin("analytics_insight_sla_breach", {
          count: stats.slaAtRiskCount,
        }),
      });
    }

    if ((stats.totalOrders.deltaPercent ?? 0) > 0) {
      items.push({
        key: "orders-up",
        text: tAdmin("analytics_insight_orders_trend_up", {
          delta: Math.abs(stats.totalOrders.deltaPercent ?? 0).toFixed(1),
        }),
      });
    } else if ((stats.totalOrders.deltaPercent ?? 0) < 0) {
      items.push({
        key: "orders-down",
        text: tAdmin("analytics_insight_orders_trend_down", {
          delta: Math.abs(stats.totalOrders.deltaPercent ?? 0).toFixed(1),
        }),
      });
    }

    return items;
  }, [stats.slaAtRiskCount, stats.totalOrders.deltaPercent, tAdmin]);

  const showCustomRangeHint =
    range === "custom" && (customFrom.trim().length === 0 || customTo.trim().length === 0);

  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {tAdmin("analytics_scope_title")}
        </h1>
        <p className="font-sans mt-3 max-w-3xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("analytics_scope_description")}
        </p>

        <fieldset className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap">
          <legend className="sr-only">Analytics time range selector</legend>
          {RANGE_KEYS.map((rangeKey) => (
            <Button
              key={rangeKey}
              type="button"
              size="sm"
              variant={range === rangeKey ? "default" : "outline"}
              className={
                range === rangeKey
                  ? "min-w-[70px] rounded-full bg-[#007eff] text-white hover:bg-[#0066d1]"
                  : "min-w-[70px] rounded-full border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
              }
              onClick={() => setRange(rangeKey)}
              aria-pressed={range === rangeKey}
            >
              {rangeKey === "custom"
                ? tAdmin("analytics_range_custom")
                : tAdmin(`analytics_range_${rangeKey}`)}
            </Button>
          ))}
        </fieldset>

        {range === "custom" ? (
          <div className="mt-4 grid gap-2 sm:flex sm:gap-2 sm:items-center sm:max-w-2xl">
            <div className="flex flex-col gap-1 sm:w-auto">
              <label
                htmlFor="custom-from"
                className="font-sans text-xs uppercase tracking-[0.12em] text-[#969696]"
              >
                {tAdmin("analytics_custom_from")}
              </label>
              <Input
                id="custom-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                aria-label={tAdmin("analytics_custom_from")}
                className="w-full sm:w-40"
              />
            </div>
            <div className="flex flex-col gap-1 sm:w-auto">
              <label
                htmlFor="custom-to"
                className="font-sans text-xs uppercase tracking-[0.12em] text-[#969696]"
              >
                {tAdmin("analytics_custom_to")}
              </label>
              <Input
                id="custom-to"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                aria-label={tAdmin("analytics_custom_to")}
                className="w-full sm:w-40"
              />
            </div>
          </div>
        ) : null}

        {showCustomRangeHint ? (
          <p className="font-sans mt-2 text-xs text-[#F0B47A]">
            {tAdmin("analytics_custom_range_incomplete")}
          </p>
        ) : null}

        <p className="font-sans mt-3 text-xs text-[#9A9A9A]">
          {tAdmin("analytics_last_updated", {
            timestamp: stats.lastUpdatedAt ? formatShortDate(stats.lastUpdatedAt) : "--",
          })}
        </p>
      </div>

      <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            key: "orders",
            label: tAdmin("analytics_kpi_total_orders"),
            value: Math.round(ordersCount),
            rawValue: stats.totalOrders.value,
            formatter: (value: number) => formatCompact(value),
            delta: stats.totalOrders.deltaPercent,
          },
          {
            key: "revenue",
            label: tAdmin("analytics_kpi_total_revenue"),
            value: revenueCount,
            rawValue: stats.totalRevenueNgn.value,
            formatter: (value: number) => formatNgn(value),
            delta: stats.totalRevenueNgn.deltaPercent,
          },
          {
            key: "active",
            label: tAdmin("analytics_kpi_active_books"),
            value: Math.round(activeBooksCount),
            rawValue: stats.activeBooksInProduction.value,
            formatter: (value: number) => formatCompact(value),
            delta: stats.activeBooksInProduction.deltaPercent,
          },
          {
            key: "pending",
            label: tAdmin("analytics_kpi_pending_transfers"),
            value: Math.round(pendingTransfersCount),
            rawValue: stats.pendingBankTransfers.value,
            formatter: (value: number) => formatCompact(value),
            delta: stats.pendingBankTransfers.deltaPercent,
          },
        ].map((card, index) => {
          const content = (
            <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-sans text-xs uppercase tracking-[0.12em] text-[#969696]">
                  {card.label}
                </p>
                <DeltaBadge deltaPercent={card.delta} />
              </div>
              <p
                className="font-display mt-3 text-3xl leading-none tracking-tight text-white md:text-4xl"
                aria-hidden="true"
              >
                {statsQuery.widget.isLoading ? "--" : card.formatter(card.value)}
              </p>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {statsQuery.widget.isLoading
                  ? card.label
                  : `${card.label}: ${card.formatter(card.rawValue)}`}
              </span>

              {card.key === "pending" && stats.slaAtRiskCount > 0 ? (
                <div className="mt-3 inline-flex items-center rounded-full border border-[#7A4B12] bg-[#2A1B0A] px-2.5 py-1 text-xs text-[#FFCE8B]">
                  <Clock3 className="mr-1.5 size-3" />
                  {tAdmin("analytics_sla_risk_inline", { count: stats.slaAtRiskCount })}
                </div>
              ) : null}
            </div>
          );

          if (prefersReducedMotion) {
            return <div key={card.key}>{content}</div>;
          }

          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.04 }}
            >
              {content}
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-[#8EC9FF]" />
          <p className="font-sans text-sm text-[#E4E4E4]">{tAdmin("analytics_insights_title")}</p>
        </div>
        <div className="grid gap-2">
          {insights.length > 0 ? (
            insights.map((insight) => (
              <p key={insight.key} className="font-sans text-sm leading-relaxed text-[#BDBDBD]">
                {insight.text}
              </p>
            ))
          ) : (
            <p className="font-sans text-sm text-[#BDBDBD]">{tAdmin("analytics_empty")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-2.5">
          <Link href="/admin/payments" className="inline-flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
            >
              {tAdmin("analytics_action_pending_payments")}
              <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
          <Link href="/admin/audit-logs" className="inline-flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
            >
              {tAdmin("analytics_action_audit_logs")}
              <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
          <Link href="/admin/orders" className="inline-flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
            >
              {tAdmin("analytics_action_orders")}
              <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
          <h2 className="font-display text-lg text-white">
            {tAdmin("analytics_chart_revenue_orders")}
          </h2>
          <p className="font-sans mt-1 text-xs text-[#989898]">
            {tAdmin("analytics_scope_description")}
          </p>
          {chartsQuery.widgets.revenueAndOrdersTrend.isLoading ? (
            <div className="mt-3 sm:mt-4">
              <ChartCardSkeleton />
            </div>
          ) : chartsQuery.widgets.revenueAndOrdersTrend.isError ? (
            <div className="mt-3 sm:mt-4">
              <WidgetError
                message={
                  normalizeAdminAnalyticsError(chartsQuery.error).description ||
                  tAdmin("analytics_load_failed")
                }
              />
            </div>
          ) : chartsQuery.widgets.revenueAndOrdersTrend.isEmpty ? (
            <div className="mt-3 sm:mt-4">
              <WidgetEmpty message={tAdmin("analytics_chart_empty_revenue_orders")} />
            </div>
          ) : (
            <div
              role="img"
              aria-label={tAdmin("analytics_chart_revenue_orders")}
              className="mt-3 h-64 sm:mt-4 sm:h-[320px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  key={`trend-${animationSeed}`}
                  data={trendData}
                  margin={{ top: 16, right: 8, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#30A46C" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#30A46C" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2D8CFF" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#2D8CFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickFormatter={formatShortDate}
                    tick={{ fill: "#AFAFAF", fontSize: 11 }}
                    axisLine={{ stroke: "#2A2A2A" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="orders"
                    tick={{ fill: "#AFAFAF", fontSize: 11 }}
                    axisLine={{ stroke: "#2A2A2A" }}
                    tickLine={false}
                    width={36}
                  />
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    tickFormatter={(value: number | string) => formatCompact(Number(value))}
                    tick={{ fill: "#AFAFAF", fontSize: 11 }}
                    axisLine={{ stroke: "#2A2A2A" }}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{
                      fontSize: "12px",
                      color: "#BFBFBF",
                      fontFamily: "var(--font-sans)",
                    }}
                  />
                  <Area
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="revenueNgn"
                    name={tAdmin("analytics_series_revenue")}
                    stroke="#30A46C"
                    fill="url(#revenueFill)"
                    strokeWidth={2}
                    isAnimationActive={!prefersReducedMotion}
                  />
                  <Area
                    yAxisId="orders"
                    type="monotone"
                    dataKey="orders"
                    name={tAdmin("analytics_series_orders")}
                    stroke="#2D8CFF"
                    fill="url(#ordersFill)"
                    strokeWidth={2}
                    isAnimationActive={!prefersReducedMotion}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
          <h2 className="font-display text-lg text-white">
            {tAdmin("analytics_chart_payment_methods")}
          </h2>
          <p className="font-sans mt-1 text-xs text-[#989898]">
            {tAdmin("analytics_scope_description")}
          </p>
          {chartsQuery.widgets.paymentMethodDistribution.isLoading ? (
            <div className="mt-4">
              <ChartCardSkeleton />
            </div>
          ) : chartsQuery.widgets.paymentMethodDistribution.isError ? (
            <div className="mt-4">
              <WidgetError
                message={
                  normalizeAdminAnalyticsError(chartsQuery.error).description ||
                  tAdmin("analytics_load_failed")
                }
              />
            </div>
          ) : chartsQuery.widgets.paymentMethodDistribution.isEmpty ? (
            <div className="mt-4">
              <WidgetEmpty message={tAdmin("analytics_chart_empty_payment_methods")} />
            </div>
          ) : (
            <div
              role="img"
              aria-label={tAdmin("analytics_chart_payment_methods")}
              className="mt-4 grid h-[320px] gap-3 sm:grid-cols-[1fr_160px] md:grid-cols-[1fr_180px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={`payment-${animationSeed}`}>
                  <Tooltip content={<ChartTooltip />} />
                  <Pie
                    data={paymentData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={95}
                    paddingAngle={3}
                    isAnimationActive={!prefersReducedMotion}
                  >
                    {paymentData.map((entry, index) => {
                      const palette = ["#2D8CFF", "#30A46C", "#FFB547", "#B387FF"];
                      return (
                        <Cell
                          key={`${entry.label}-${entry.value}`}
                          fill={palette[index % palette.length]}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="hidden content-center gap-2 sm:grid">
                {paymentData.map((entry, index) => {
                  const palette = ["#2D8CFF", "#30A46C", "#FFB547", "#B387FF"];
                  return (
                    <div
                      key={`${entry.label}-${entry.value}`}
                      className="flex items-center justify-between gap-1 text-right sm:text-left"
                    >
                      <span className="font-sans inline-flex items-center text-xs text-[#CFCFCF]">
                        <span
                          className="mr-2 inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: palette[index % palette.length] }}
                        />
                        {entry.label}
                      </span>
                      <span className="font-sans text-xs text-white">{entry.value}</span>
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:hidden">
                {paymentData.map((entry, index) => {
                  const palette = ["#2D8CFF", "#30A46C", "#FFB547", "#B387FF"];
                  return (
                    <div
                      key={`${entry.label}-legend-mobile-${entry.value}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-sans inline-flex items-center text-xs text-[#CFCFCF]">
                        <span
                          className="mr-2 inline-block size-2 rounded-full"
                          style={{ backgroundColor: palette[index % palette.length] }}
                        />
                        {entry.label}
                      </span>
                      <span className="font-sans text-xs text-white">{entry.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
          <h2 className="font-display text-lg text-white">
            {tAdmin("analytics_chart_order_status")}
          </h2>
          <p className="font-sans mt-1 text-xs text-[#989898]">
            {tAdmin("analytics_scope_description")}
          </p>
          {chartsQuery.widgets.orderStatusDistribution.isLoading ? (
            <div className="mt-3 sm:mt-4">
              <ChartCardSkeleton />
            </div>
          ) : chartsQuery.widgets.orderStatusDistribution.isError ? (
            <div className="mt-3 sm:mt-4">
              <WidgetError
                message={
                  normalizeAdminAnalyticsError(chartsQuery.error).description ||
                  tAdmin("analytics_load_failed")
                }
              />
            </div>
          ) : chartsQuery.widgets.orderStatusDistribution.isEmpty ? (
            <div className="mt-3 sm:mt-4">
              <WidgetEmpty message={tAdmin("analytics_chart_empty_order_status")} />
            </div>
          ) : (
            <div
              role="img"
              aria-label={tAdmin("analytics_chart_order_status")}
              className="mt-3 h-64 sm:mt-4 sm:h-[320px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  key={`status-${animationSeed}`}
                  data={statusData}
                  margin={{ top: 16, right: 8, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="status"
                    tick={{ fill: "#AFAFAF", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#2A2A2A" }}
                  />
                  <YAxis
                    tick={{ fill: "#AFAFAF", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#2A2A2A" }}
                    width={32}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="total"
                    name={tAdmin("analytics_series_total")}
                    stackId="status"
                    isAnimationActive={!prefersReducedMotion}
                    radius={[6, 6, 0, 0]}
                  >
                    {statusData.map((entry, index) => {
                      const palette = ["#2D8CFF", "#30A46C", "#FFB547", "#E35D6A", "#B387FF"];
                      return (
                        <Cell
                          key={`${entry.status}-${entry.total}`}
                          fill={palette[index % palette.length]}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
          <h2 className="font-display text-lg text-white">
            {tAdmin("analytics_chart_transfer_sla")}
          </h2>
          <p className="font-sans mt-1 text-xs text-[#989898]">
            {tAdmin("analytics_scope_description")}
          </p>
          {chartsQuery.widgets.bankTransferSlaTrend.isLoading ? (
            <div className="mt-3 sm:mt-4">
              <ChartCardSkeleton />
            </div>
          ) : chartsQuery.widgets.bankTransferSlaTrend.isError ? (
            <div className="mt-3 sm:mt-4">
              <WidgetError
                message={
                  normalizeAdminAnalyticsError(chartsQuery.error).description ||
                  tAdmin("analytics_load_failed")
                }
              />
            </div>
          ) : chartsQuery.widgets.bankTransferSlaTrend.isEmpty ? (
            <div className="mt-3 sm:mt-4">
              <WidgetEmpty message={tAdmin("analytics_chart_empty_transfer_sla")} />
            </div>
          ) : (
            <div
              role="img"
              aria-label={tAdmin("analytics_chart_transfer_sla")}
              className="mt-3 h-64 sm:mt-4 sm:h-[320px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  key={`sla-${animationSeed}`}
                  data={slaData}
                  margin={{ top: 16, right: 8, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickFormatter={formatShortDate}
                    tick={{ fill: "#AFAFAF", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#2A2A2A" }}
                  />
                  <YAxis
                    tick={{ fill: "#AFAFAF", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#2A2A2A" }}
                    width={32}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{
                      fontSize: "12px",
                      color: "#BFBFBF",
                      fontFamily: "var(--font-sans)",
                    }}
                  />
                  <Bar
                    dataKey="under15m"
                    stackId="sla"
                    fill="#30A46C"
                    name={tAdmin("analytics_series_sla_under15")}
                    isAnimationActive={!prefersReducedMotion}
                  />
                  <Bar
                    dataKey="between15mAnd30m"
                    stackId="sla"
                    fill="#FFB547"
                    name={tAdmin("analytics_series_sla_15_30")}
                    isAnimationActive={!prefersReducedMotion}
                  />
                  <Bar
                    dataKey="over30m"
                    stackId="sla"
                    fill="#E35D6A"
                    name={tAdmin("analytics_series_sla_over30")}
                    isAnimationActive={!prefersReducedMotion}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
