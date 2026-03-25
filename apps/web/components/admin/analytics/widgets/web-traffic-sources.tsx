"use client";

import type { WebAnalyticsReferrersResponse } from "@bookprinta/shared";
import { useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";
import { CsvExportButton } from "./csv-export-button";

const PALETTE = ["#2D8CFF", "#30A46C", "#FFB547", "#B387FF", "#E35D6A", "#7DD3FC", "#FACC15"];

type WebTrafficSourcesProps = {
  data: WebAnalyticsReferrersResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};

function SourceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { source: string; visitors: number; percentage: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#2A2A2A] bg-[#111] px-3 py-2 shadow-lg">
      <p className="font-sans text-sm font-medium text-white">{d.source}</p>
      <p className="font-sans mt-0.5 text-xs text-[#B4B4B4]">
        {d.visitors.toLocaleString("en-NG")} visitors ({d.percentage}%)
      </p>
    </div>
  );
}

export function WebTrafficSources({ data, isLoading, isError }: WebTrafficSourcesProps) {
  const t = useTranslations("admin");
  const prefersReducedMotion = useReducedMotion();
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <Skeleton className="h-5 w-36 bg-[#1A1A1A]" />
        <Skeleton className="mx-auto mt-4 h-44 w-44 rounded-full bg-[#1A1A1A]" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-white">{t("web_analytics_traffic_sources")}</h2>
        {items.length > 0 && (
          <CsvExportButton
            onClick={() =>
              downloadCsv(
                items.map((i) => ({
                  source: i.source,
                  visitors: i.visitors,
                  percentage: i.percentage,
                })),
                "traffic-sources"
              )
            }
          />
        )}
      </div>

      {isError ? (
        <p className="font-sans mt-4 text-sm text-[#E35D6A]">{t("analytics_load_failed")}</p>
      ) : items.length === 0 ? (
        <p className="font-sans mt-4 text-sm text-[#7D7D7D]">{t("web_analytics_no_data")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            role="img"
            aria-label={t("web_analytics_traffic_sources")}
            className="mx-auto h-44 w-44 shrink-0 sm:mx-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  dataKey="visitors"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  strokeWidth={0}
                  isAnimationActive={!prefersReducedMotion}
                >
                  {items.map((entry, index) => (
                    <Cell key={`src-cell-${entry.source}`} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<SourceTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-1.5">
            {items.slice(0, 6).map((item, index) => (
              <li key={`src-legend-${item.source}`} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                  aria-hidden="true"
                />
                <span className="font-sans truncate text-[#E8E8E8]">{item.source}</span>
                <span className="font-sans ml-auto shrink-0 tabular-nums text-[#B4B4B4]">
                  {item.percentage}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
