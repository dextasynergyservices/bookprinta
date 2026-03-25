"use client";

import type { WebAnalyticsFunnelResponse } from "@bookprinta/shared";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";
import { CsvExportButton } from "./csv-export-button";

const STEP_COLORS = ["#2D8CFF", "#30A46C", "#FFB547", "#B387FF", "#E35D6A"];

type WebConversionFunnelProps = {
  data: WebAnalyticsFunnelResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function WebConversionFunnel({ data, isLoading, isError }: WebConversionFunnelProps) {
  const t = useTranslations("admin");
  const steps = data?.steps ?? [];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <Skeleton className="h-5 w-40 bg-[#1A1A1A]" />
        <div className="mt-4 flex gap-2">
          {["a", "b", "c", "d"].map((id) => (
            <Skeleton key={`funnel-skel-${id}`} className="h-28 flex-1 bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-white">{t("web_analytics_funnel")}</h2>
        {steps.length > 0 && (
          <CsvExportButton
            onClick={() =>
              downloadCsv(
                steps.map((s) => ({
                  step: s.step,
                  count: s.count,
                  percentage: s.percentage,
                  dropoff: s.dropoff,
                })),
                "conversion-funnel"
              )
            }
          />
        )}
      </div>

      {isError ? (
        <p className="font-sans mt-4 text-sm text-[#E35D6A]">{t("analytics_load_failed")}</p>
      ) : steps.length === 0 ? (
        <p className="font-sans mt-4 text-sm text-[#7D7D7D]">{t("web_analytics_no_data")}</p>
      ) : (
        <div className="mt-4">
          {/* Horizontal funnel bars */}
          <div className="hidden gap-1 md:flex" role="img" aria-label={t("web_analytics_funnel")}>
            {steps.map((step, index) => {
              const barWidth = Math.max(step.percentage, 8);
              const color = STEP_COLORS[index % STEP_COLORS.length];
              return (
                <div key={step.step} className="flex-1">
                  <div
                    className="flex items-center justify-center rounded-lg px-2 py-3 transition-all"
                    style={{
                      backgroundColor: `${color}20`,
                      borderLeft: `3px solid ${color}`,
                      minHeight: `${barWidth}px`,
                    }}
                  >
                    <div className="text-center">
                      <p className="font-sans text-xs font-medium text-[#E8E8E8]">{step.step}</p>
                      <p className="font-display mt-1 text-lg font-semibold text-white">
                        {step.count.toLocaleString("en-NG")}
                      </p>
                      <p className="font-sans text-xs text-[#969696]">{step.percentage}%</p>
                    </div>
                  </div>
                  {step.dropoff > 0 && (
                    <p className="font-sans mt-1 text-center text-[10px] text-[#E35D6A]">
                      -{step.dropoff}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Vertical funnel for mobile */}
          <div className="space-y-2 md:hidden">
            {steps.map((step, index) => {
              const color = STEP_COLORS[index % STEP_COLORS.length];
              return (
                <div key={step.step}>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 rounded"
                      style={{
                        width: `${Math.max(step.percentage, 8)}%`,
                        backgroundColor: color,
                      }}
                    />
                    <div className="shrink-0">
                      <p className="font-sans text-sm font-medium text-[#E8E8E8]">{step.step}</p>
                      <p className="font-sans text-xs tabular-nums text-[#969696]">
                        {step.count.toLocaleString("en-NG")} ({step.percentage}%)
                      </p>
                    </div>
                  </div>
                  {step.dropoff > 0 && (
                    <p className="font-sans ml-1 mt-0.5 text-[10px] text-[#E35D6A]">
                      ↓ {step.dropoff}% drop-off
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
