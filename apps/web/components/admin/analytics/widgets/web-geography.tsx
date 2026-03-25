"use client";

import type { WebAnalyticsGeographyResponse } from "@bookprinta/shared";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";
import { CsvExportButton } from "./csv-export-button";

type WebGeographyProps = {
  data: WebAnalyticsGeographyResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function WebGeography({ data, isLoading, isError }: WebGeographyProps) {
  const t = useTranslations("admin");
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <Skeleton className="h-5 w-44 bg-[#1A1A1A]" />
        <div className="mt-4 space-y-3">
          {["a", "b", "c", "d", "e"].map((id) => (
            <Skeleton key={`geo-skel-${id}`} className="h-6 w-full bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-white">{t("web_analytics_geography")}</h2>
        {items.length > 0 && (
          <CsvExportButton
            onClick={() =>
              downloadCsv(
                items.map((i) => ({
                  country: i.country,
                  country_code: i.countryCode,
                  visitors: i.visitors,
                  percentage: i.percentage,
                })),
                "geography"
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
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.countryCode || item.country} className="group relative">
              <div
                className="absolute inset-y-0 left-0 rounded bg-[#30A46C]/10"
                style={{ width: `${Math.max(item.percentage, 4)}%` }}
              />
              <div className="relative flex items-center justify-between px-2 py-1.5">
                <span className="font-sans flex items-center gap-2 text-sm text-[#E8E8E8]">
                  {item.countryCode && (
                    <span className="text-base leading-none" aria-hidden="true">
                      {countryCodeToEmoji(item.countryCode)}
                    </span>
                  )}
                  {item.country}
                </span>
                <span className="font-sans ml-3 shrink-0 tabular-nums text-sm text-[#B4B4B4]">
                  {item.visitors.toLocaleString("en-NG")} ({item.percentage}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function countryCodeToEmoji(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return "";
  return String.fromCodePoint(upper.charCodeAt(0) + 0x1f1a5, upper.charCodeAt(1) + 0x1f1a5);
}
