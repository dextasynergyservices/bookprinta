"use client";

import type { WebAnalyticsVisitorsResponse } from "@bookprinta/shared";
import { useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

function formatShortDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", { month: "short", day: "2-digit" }).format(parsed);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#2A2A2A] bg-[#111] px-3 py-2 shadow-lg">
      <p className="font-sans text-xs text-[#969696]">{formatShortDate(String(label))}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="font-sans mt-1 text-sm font-medium"
          style={{ color: entry.color }}
        >
          {entry.name}: {entry.value.toLocaleString("en-NG")}
        </p>
      ))}
    </div>
  );
}

type WebVisitorsChartProps = {
  data: WebAnalyticsVisitorsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function WebVisitorsChart({ data, isLoading, isError }: WebVisitorsChartProps) {
  const t = useTranslations("admin");
  const prefersReducedMotion = useReducedMotion();
  const points = data?.points ?? [];
  const isEmpty = points.length === 0;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <Skeleton className="h-5 w-48 bg-[#1A1A1A]" />
        <Skeleton className="mt-4 h-64 w-full bg-[#1A1A1A] sm:h-[320px]" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <h2 className="font-display text-lg text-white">{t("web_analytics_visitors_chart")}</h2>

      {isError ? (
        <p className="font-sans mt-4 text-sm text-[#E35D6A]">{t("analytics_load_failed")}</p>
      ) : isEmpty ? (
        <p className="font-sans mt-4 text-sm text-[#7D7D7D]">{t("web_analytics_no_data")}</p>
      ) : (
        <div
          role="img"
          aria-label={t("web_analytics_visitors_chart")}
          className="mt-3 h-64 overflow-hidden sm:mt-4 sm:h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 16, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gradVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2D8CFF" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2D8CFF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPageviews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#30A46C" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#30A46C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
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
              <Area
                type="monotone"
                dataKey="visitors"
                name={t("web_analytics_visitors")}
                stroke="#2D8CFF"
                fill="url(#gradVisitors)"
                strokeWidth={2}
                isAnimationActive={!prefersReducedMotion}
              />
              <Area
                type="monotone"
                dataKey="pageviews"
                name={t("web_analytics_pageviews")}
                stroke="#30A46C"
                fill="url(#gradPageviews)"
                strokeWidth={2}
                isAnimationActive={!prefersReducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
