"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export function DashboardProductionDelayBanner() {
  const tDashboard = useTranslations("dashboard");

  return (
    <aside
      aria-live="polite"
      aria-label={tDashboard("production_delay_banner_aria")}
      className="sticky top-14 z-20 w-full border-b border-[#F59E0B]/35 bg-[#FEF3C7] font-sans text-[#92400E] sm:top-16 lg:top-20"
    >
      <div className="mx-auto flex max-w-[1600px] items-start gap-3 px-4 py-3 sm:px-5 lg:px-8">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FFF7DA] text-[#92400E]">
          <AlertTriangle className="size-4" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#92400E]">
            {tDashboard("notifications")}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#92400E]">
            {tDashboard("production_delay_banner")}
          </p>
        </div>
      </div>
    </aside>
  );
}
