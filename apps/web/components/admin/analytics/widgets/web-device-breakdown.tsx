"use client";

import type { WebAnalyticsDevicesResponse } from "@bookprinta/shared";
import { useReducedMotion } from "framer-motion";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";
import { CsvExportButton } from "./csv-export-button";

const PALETTE = ["#2D8CFF", "#30A46C", "#FFB547", "#B387FF", "#E35D6A"];

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  Desktop: Monitor,
  Mobile: Smartphone,
  Tablet: Tablet,
};

function DeviceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { category: string; count: number; percentage: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#2A2A2A] bg-[#111] px-3 py-2 shadow-lg">
      <p className="font-sans text-sm font-medium text-white">{d.category}</p>
      <p className="font-sans mt-0.5 text-xs text-[#B4B4B4]">
        {d.count.toLocaleString("en-NG")} ({d.percentage}%)
      </p>
    </div>
  );
}

type WebDeviceBreakdownProps = {
  data: WebAnalyticsDevicesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function WebDeviceBreakdown({ data, isLoading, isError }: WebDeviceBreakdownProps) {
  const t = useTranslations("admin");
  const prefersReducedMotion = useReducedMotion();
  const devices = data?.deviceTypes ?? [];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <Skeleton className="h-5 w-40 bg-[#1A1A1A]" />
        <Skeleton className="mx-auto mt-4 h-44 w-44 rounded-full bg-[#1A1A1A]" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-white">{t("web_analytics_devices")}</h2>
        {devices.length > 0 && (
          <CsvExportButton
            onClick={() =>
              downloadCsv(
                devices.map((d) => ({
                  device: d.category,
                  count: d.count,
                  percentage: d.percentage,
                })),
                "devices"
              )
            }
          />
        )}
      </div>

      {isError ? (
        <p className="font-sans mt-4 text-sm text-[#E35D6A]">{t("analytics_load_failed")}</p>
      ) : devices.length === 0 ? (
        <p className="font-sans mt-4 text-sm text-[#7D7D7D]">{t("web_analytics_no_data")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            role="img"
            aria-label={t("web_analytics_devices")}
            className="mx-auto h-44 w-44 shrink-0 sm:mx-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={devices}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  strokeWidth={0}
                  isAnimationActive={!prefersReducedMotion}
                >
                  {devices.map((entry, index) => (
                    <Cell key={entry.category} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<DeviceTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-2">
            {devices.map((item, index) => {
              const Icon = DEVICE_ICONS[item.category] ?? Monitor;
              return (
                <li key={item.category} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="inline-flex size-6 items-center justify-center rounded"
                    style={{ backgroundColor: `${PALETTE[index % PALETTE.length]}20` }}
                  >
                    <Icon
                      className="size-3.5"
                      style={{ color: PALETTE[index % PALETTE.length] }}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="font-sans text-[#E8E8E8]">{item.category}</span>
                  <span className="font-sans ml-auto shrink-0 tabular-nums text-[#B4B4B4]">
                    {item.percentage}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
