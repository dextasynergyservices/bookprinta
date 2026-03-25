"use client";

import type { WebAnalyticsCustomEventsResponse } from "@bookprinta/shared";
import { useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";
import { CsvExportButton } from "./csv-export-button";

const EVENT_LABELS: Record<string, string> = {
  package_selected: "Package Selected",
  configuration_completed: "Config Completed",
  checkout_started: "Checkout Started",
  payment_completed: "Payment Completed",
  quote_submitted: "Quote Submitted",
  manuscript_uploaded: "Manuscript Uploaded",
  book_approved: "Book Approved",
};

function EventTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { event: string; count: number; uniqueUsers: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#2A2A2A] bg-[#111] px-3 py-2 shadow-lg">
      <p className="font-sans text-sm font-medium text-white">{EVENT_LABELS[d.event] ?? d.event}</p>
      <p className="font-sans mt-0.5 text-xs text-[#B4B4B4]">
        {d.count.toLocaleString("en-NG")} events · {d.uniqueUsers.toLocaleString("en-NG")} users
      </p>
    </div>
  );
}

type WebCustomEventsProps = {
  data: WebAnalyticsCustomEventsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function WebCustomEvents({ data, isLoading, isError }: WebCustomEventsProps) {
  const t = useTranslations("admin");
  const prefersReducedMotion = useReducedMotion();
  const items = (data?.items ?? []).map((item) => ({
    ...item,
    label: EVENT_LABELS[item.event] ?? item.event,
  }));

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <Skeleton className="h-5 w-44 bg-[#1A1A1A]" />
        <Skeleton className="mt-4 h-64 w-full bg-[#1A1A1A]" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-white">{t("web_analytics_custom_events")}</h2>
        {items.length > 0 && (
          <CsvExportButton
            onClick={() =>
              downloadCsv(
                items.map((i) => ({
                  event: i.event,
                  label: i.label,
                  count: i.count,
                  unique_users: i.uniqueUsers,
                })),
                "custom-events"
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
        <div
          role="img"
          aria-label={t("web_analytics_custom_events")}
          className="mt-3 h-64 overflow-hidden sm:mt-4 sm:h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={items}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#222" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#AFAFAF", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#2A2A2A" }}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={130}
                tick={{ fill: "#AFAFAF", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#2A2A2A" }}
              />
              <Tooltip content={<EventTooltip />} />
              <Bar
                dataKey="count"
                fill="#2D8CFF"
                radius={[0, 6, 6, 0]}
                isAnimationActive={!prefersReducedMotion}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
