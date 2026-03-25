"use client";

import type { WebAnalyticsPagesResponse } from "@bookprinta/shared";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";
import { CsvExportButton } from "./csv-export-button";

type WebTopPagesTableProps = {
  data: WebAnalyticsPagesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function WebTopPagesTable({ data, isLoading, isError }: WebTopPagesTableProps) {
  const t = useTranslations("admin");
  const items = data?.items ?? [];
  const maxViews = items.length > 0 ? items[0].views : 1;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
        <Skeleton className="h-5 w-32 bg-[#1A1A1A]" />
        <div className="mt-4 space-y-3">
          {["a", "b", "c", "d", "e"].map((id) => (
            <Skeleton key={`page-skel-${id}`} className="h-6 w-full bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-white">{t("web_analytics_top_pages")}</h2>
        {items.length > 0 && (
          <CsvExportButton
            onClick={() =>
              downloadCsv(
                items.map((i) => ({ page: i.page, views: i.views })),
                "top-pages"
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
        <div className="mt-4 space-y-2.5">
          {items.map((item) => {
            const barWidth = Math.max((item.views / maxViews) * 100, 4);
            return (
              <div key={item.page} className="group relative">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-[#2D8CFF]/10"
                  style={{ width: `${barWidth}%` }}
                />
                <div className="relative flex items-center justify-between px-2 py-1.5">
                  <span className="font-sans truncate text-sm text-[#E8E8E8]" title={item.page}>
                    {simplifyPath(item.page)}
                  </span>
                  <span className="font-sans ml-3 shrink-0 text-sm tabular-nums text-[#B4B4B4]">
                    {item.views.toLocaleString("en-NG")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function simplifyPath(url: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}
