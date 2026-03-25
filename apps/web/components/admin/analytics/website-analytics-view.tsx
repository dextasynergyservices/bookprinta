"use client";

import type { AdminDashboardRangeKey } from "@bookprinta/shared";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useWebCustomEvents,
  useWebDevices,
  useWebFunnel,
  useWebGeography,
  useWebOverview,
  useWebPages,
  useWebReferrers,
  useWebVisitors,
} from "@/hooks/useWebAnalytics";
import { WebConversionFunnel } from "./widgets/web-conversion-funnel";
import { WebCustomEvents } from "./widgets/web-custom-events";
import { WebDeviceBreakdown } from "./widgets/web-device-breakdown";
import { WebGeography } from "./widgets/web-geography";
import { WebLiveVisitorsBadge } from "./widgets/web-live-visitors-badge";
import { WebOverviewCards } from "./widgets/web-overview-cards";
import { WebTopPagesTable } from "./widgets/web-top-pages-table";
import { WebTrafficSources } from "./widgets/web-traffic-sources";
import { WebVisitorsChart } from "./widgets/web-visitors-chart";

const RANGE_KEYS: AdminDashboardRangeKey[] = ["7d", "30d", "90d", "12m", "custom"];

function asIsoStartOfDay(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00`).toISOString();
}

function asIsoEndOfDay(dateValue: string): string {
  return new Date(`${dateValue}T23:59:59`).toISOString();
}

export function WebsiteAnalyticsView() {
  const t = useTranslations("admin");

  const [range, setRange] = useState<AdminDashboardRangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const queryInput = useMemo(() => {
    if (range !== "custom") return { range };
    return {
      range,
      ...(customFrom ? { from: asIsoStartOfDay(customFrom) } : {}),
      ...(customTo ? { to: asIsoEndOfDay(customTo) } : {}),
    };
  }, [range, customFrom, customTo]);

  const overview = useWebOverview(queryInput);
  const visitors = useWebVisitors(queryInput);
  const pages = useWebPages(queryInput, 10);
  const referrers = useWebReferrers(queryInput);
  const geography = useWebGeography(queryInput);
  const devices = useWebDevices(queryInput);
  const funnel = useWebFunnel(queryInput);
  const customEvents = useWebCustomEvents(queryInput);

  const showCustomRangeHint =
    range === "custom" && (customFrom.trim().length === 0 || customTo.trim().length === 0);

  return (
    <div className="grid min-w-0 gap-4">
      {/* Live visitors + Range selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <WebLiveVisitorsBadge />
        <fieldset className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 md:flex-wrap">
          <legend className="sr-only">Website analytics time range selector</legend>
          {RANGE_KEYS.map((rangeKey) => (
            <Button
              key={rangeKey}
              type="button"
              size="sm"
              variant={range === rangeKey ? "default" : "outline"}
              className={
                range === rangeKey
                  ? "shrink-0 rounded-full bg-[#007eff] px-4 text-white hover:bg-[#0066d1]"
                  : "shrink-0 rounded-full border-[#2A2A2A] bg-[#0D0D0D] px-4 text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
              }
              onClick={() => setRange(rangeKey)}
              aria-pressed={range === rangeKey}
            >
              {rangeKey === "custom"
                ? t("analytics_range_custom")
                : t(`analytics_range_${rangeKey}`)}
            </Button>
          ))}
        </fieldset>
      </div>

      {range === "custom" && (
        <div className="grid gap-2 sm:flex sm:items-center sm:gap-2 sm:max-w-2xl">
          <div className="flex flex-col gap-1 sm:w-auto">
            <label
              htmlFor="web-custom-from"
              className="font-sans text-xs uppercase tracking-[0.12em] text-[#969696]"
            >
              {t("analytics_custom_from")}
            </label>
            <Input
              id="web-custom-from"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label={t("analytics_custom_from")}
              className="w-full sm:w-40"
            />
          </div>
          <div className="flex flex-col gap-1 sm:w-auto">
            <label
              htmlFor="web-custom-to"
              className="font-sans text-xs uppercase tracking-[0.12em] text-[#969696]"
            >
              {t("analytics_custom_to")}
            </label>
            <Input
              id="web-custom-to"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label={t("analytics_custom_to")}
              className="w-full sm:w-40"
            />
          </div>
        </div>
      )}

      {showCustomRangeHint && (
        <p className="font-sans text-xs text-[#F0B47A]">{t("analytics_custom_range_incomplete")}</p>
      )}

      {/* KPI cards */}
      <WebOverviewCards data={overview.data} isLoading={overview.isPending && !overview.data} />

      {/* Visitors trend chart */}
      <WebVisitorsChart
        data={visitors.data}
        isLoading={visitors.isPending && !visitors.data}
        isError={visitors.isError}
      />

      {/* Top pages + Traffic sources (side by side on desktop) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WebTopPagesTable
          data={pages.data}
          isLoading={pages.isPending && !pages.data}
          isError={pages.isError}
        />
        <WebTrafficSources
          data={referrers.data}
          isLoading={referrers.isPending && !referrers.data}
          isError={referrers.isError}
        />
      </div>

      {/* Devices + Geography (side by side on desktop) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WebDeviceBreakdown
          data={devices.data}
          isLoading={devices.isPending && !devices.data}
          isError={devices.isError}
        />
        <WebGeography
          data={geography.data}
          isLoading={geography.isPending && !geography.data}
          isError={geography.isError}
        />
      </div>

      {/* Conversion funnel */}
      <WebConversionFunnel
        data={funnel.data}
        isLoading={funnel.isPending && !funnel.data}
        isError={funnel.isError}
      />

      {/* Custom business events */}
      <WebCustomEvents
        data={customEvents.data}
        isLoading={customEvents.isPending && !customEvents.data}
        isError={customEvents.isError}
      />
    </div>
  );
}
