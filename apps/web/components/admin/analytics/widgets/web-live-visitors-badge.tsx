"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebLiveVisitors } from "@/hooks/useWebAnalytics";

export function WebLiveVisitorsBadge() {
  const t = useTranslations("admin");
  const { data, isPending, isError } = useWebLiveVisitors();

  if (isPending) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-[#1F1F1F] bg-[#0D0D0D] px-3 py-1.5">
        <Skeleton className="size-2 rounded-full bg-[#1A1A1A]" />
        <Skeleton className="h-3.5 w-10 bg-[#1A1A1A]" />
      </div>
    );
  }

  if (isError || !data) {
    return null;
  }

  const count = data.activeVisitors;

  return (
    <output
      className="inline-flex items-center gap-2 rounded-full border border-[#1F1F1F] bg-[#0D0D0D] px-3 py-1.5"
      aria-live="polite"
      aria-label={t("web_analytics_live_aria", { count })}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#30A46C] opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-[#30A46C]" />
      </span>
      <span className="font-sans text-xs font-medium tabular-nums text-[#E8E8E8]">
        {count.toLocaleString("en-NG")}
      </span>
      <span className="font-sans text-xs text-[#7D7D7D]">{t("web_analytics_live_label")}</span>
    </output>
  );
}
