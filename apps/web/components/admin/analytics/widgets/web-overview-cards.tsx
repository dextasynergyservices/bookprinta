"use client";

import type { WebAnalyticsOverview } from "@bookprinta/shared";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) return null;

  const isUp = value > 0;
  const isDown = value < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? "text-[#30A46C]" : isDown ? "text-[#E35D6A]" : "text-[#7D7D7D]";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  delta,
  format = "number",
}: {
  label: string;
  value: number | null;
  delta: number | null;
  format?: "number" | "percent";
}) {
  const displayValue =
    value === null ? "—" : format === "percent" ? `${value.toFixed(1)}%` : formatCompact(value);

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4">
      <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-[#969696]">
        {label}
      </p>
      <p className="font-display mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
        {displayValue}
      </p>
      <div className="mt-1">
        <DeltaBadge value={delta} />
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4">
      <Skeleton className="h-3 w-20 bg-[#1A1A1A]" />
      <Skeleton className="mt-3 h-8 w-24 bg-[#1A1A1A]" />
      <Skeleton className="mt-2 h-3 w-16 bg-[#1A1A1A]" />
    </div>
  );
}

type WebOverviewCardsProps = {
  data: WebAnalyticsOverview | undefined;
  isLoading: boolean;
};

export function WebOverviewCards({ data, isLoading }: WebOverviewCardsProps) {
  const t = useTranslations("admin");

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {["visitors", "pageviews", "sessions", "bounce"].map((id) => (
          <KpiSkeleton key={`web-kpi-skeleton-${id}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <KpiCard
        label={t("web_analytics_visitors")}
        value={data?.uniqueVisitors ?? null}
        delta={data?.deltaVisitors ?? null}
      />
      <KpiCard
        label={t("web_analytics_pageviews")}
        value={data?.totalPageviews ?? null}
        delta={data?.deltaPageviews ?? null}
      />
      <KpiCard
        label={t("web_analytics_sessions")}
        value={data?.totalSessions ?? null}
        delta={null}
      />
      <KpiCard
        label={t("web_analytics_bounce_rate")}
        value={data?.bounceRate ?? null}
        delta={null}
        format="percent"
      />
    </div>
  );
}
