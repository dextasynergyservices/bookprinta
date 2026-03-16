"use client";

import type { OrdersListItem } from "@bookprinta/shared";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  OrderMetaText,
  OrderReferenceText,
  OrderStatusBadge,
  ReprintBadge,
} from "@/components/dashboard/orders";
import { Button } from "@/components/ui/button";
import type { DashboardTranslator } from "@/lib/dashboard/book-workspace-summary";
import {
  formatDashboardCurrency,
  formatDashboardDate,
  toDashboardStatusLabel,
} from "@/lib/dashboard/dashboard-formatters";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

export const SURFACE =
  "relative overflow-hidden rounded-[32px] border border-white/10 bg-[#090909] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.42)] md:p-7";
export const SUB_SURFACE =
  "relative overflow-hidden rounded-[26px] border border-white/10 bg-[#0D0D0F] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
export const SECTION_REVEAL_CLASS =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-700";
export const PRIMARY_BUTTON_CLASS =
  "font-sans min-h-12 rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,126,255,0.32)] hover:bg-[#0A72DF] hover:brightness-110";
export const SECONDARY_BUTTON_CLASS =
  "font-sans min-h-11 rounded-full border border-white/10 bg-[#050505] px-5 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#11161d]";
export const EYEBROW_PILL_CLASS =
  "inline-flex min-h-8 items-center rounded-full border border-[#007eff]/30 bg-[#007eff]/10 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9FD0FF]";
export const PAGE_AMBIENT_STYLE = {
  background:
    "radial-gradient(44% 32% at 4% 0%, rgba(0,126,255,0.16) 0%, rgba(0,0,0,0) 72%), radial-gradient(32% 28% at 100% 18%, rgba(0,126,255,0.11) 0%, rgba(0,0,0,0) 78%)",
};
export const BELOW_FOLD_SECTION_CLASS =
  "[content-visibility:auto] [contain-intrinsic-size:1px_760px]";

export function SectionHeading({
  eyebrow,
  title,
  description,
  titleId,
  descriptionId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  titleId?: string;
  descriptionId?: string;
}) {
  return (
    <header className="min-w-0">
      <p className={cn(EYEBROW_PILL_CLASS, "w-fit")}>{eyebrow}</p>
      <h2
        id={titleId}
        className="font-display mt-4 max-w-[14ch] text-[2.1rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white md:text-[2.8rem] lg:text-[3.1rem]"
      >
        {title}
      </h2>
      <p
        id={descriptionId}
        className="mt-3 max-w-2xl font-serif text-base leading-7 text-[#B9B9B9]"
      >
        {description}
      </p>
    </header>
  );
}

export function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={cn(
        SUB_SURFACE,
        "px-4 py-4 md:px-5",
        tone === "accent" && "border-[#007eff]/20 bg-[#09111A]"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#007eff]/0 via-[#007eff]/45 to-[#007eff]/0"
      />
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8F8F8F]">
        {label}
      </p>
      <p
        className={cn(
          "mt-3 font-display text-[2.2rem] leading-none font-semibold tracking-[-0.05em] text-white",
          tone === "accent" && "text-[#DCEBFF]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  href,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <div className={cn(SUB_SURFACE, "mt-6 p-5 text-center md:p-6")}>
      <div
        aria-hidden="true"
        className="mx-auto inline-flex size-14 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101a] text-[#9FD0FF] shadow-[0_10px_30px_rgba(0,126,255,0.18)]"
      >
        {icon}
      </div>
      <h3 className="font-display mt-5 text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
        {title}
      </h3>
      <p className="mx-auto mt-3 max-w-xl font-serif text-base leading-7 text-[#B8B8B8]">
        {description}
      </p>
      <div className="mt-6">
        <Button asChild className={SECONDARY_BUTTON_CLASS}>
          <Link href={href}>{ctaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

export function QuickLinkCard({
  href,
  title,
  description,
  icon,
  cta,
  tone,
  ariaLabel,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  cta: string;
  tone: "blue" | "steel" | "ink" | "night";
  ariaLabel?: string;
}) {
  const toneClassName =
    tone === "blue"
      ? "border-[#007eff]/25 bg-[#08111C]"
      : tone === "steel"
        ? "bg-[#0E1014]"
        : tone === "ink"
          ? "bg-[#0B0C0E]"
          : "bg-[#0C1016]";

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        SURFACE,
        toneClassName,
        "group min-h-[14rem] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#007eff] hover:bg-[#101722] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,126,255,0.10) 0%, rgba(0,0,0,0) 38%), radial-gradient(58% 48% at 100% 0%, rgba(0,126,255,0.10) 0%, rgba(0,0,0,0) 74%)",
        }}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div>
          <span
            aria-hidden="true"
            className="inline-flex size-12 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101a] text-[#9FD0FF] shadow-[0_8px_24px_rgba(0,126,255,0.16)]"
          >
            {icon}
          </span>
          <h3 className="font-display mt-5 max-w-[10ch] text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
            {title}
          </h3>
          <p className="mt-3 max-w-[22rem] font-serif text-base leading-7 text-[#B8B8B8]">
            {description}
          </p>
        </div>
        <span className="mt-8 inline-flex items-center gap-2 font-sans text-sm font-semibold text-white">
          {cta}
          <ArrowRight
            className="size-4 text-[#9FD0FF] transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}

export function RecentOrderCard({
  order,
  locale,
  tDashboard,
}: {
  order: OrdersListItem;
  locale: string;
  tDashboard: DashboardTranslator;
}) {
  return (
    <article className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0C0C0E] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-transform duration-200 hover:-translate-y-0.5 md:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,126,255,0.08) 0%, rgba(0,0,0,0) 32%), radial-gradient(54% 38% at 100% 0%, rgba(0,126,255,0.08) 0%, rgba(0,0,0,0) 74%)",
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <OrderReferenceText>{order.orderNumber}</OrderReferenceText>
          <div className="flex flex-wrap justify-end gap-2">
            <ReprintBadge orderType={order.orderType} label={tDashboard("orders_reprint_badge")} />
            <OrderStatusBadge
              orderStatus={order.status}
              bookStatus={order.book?.status ?? null}
              label={
                toDashboardStatusLabel(order.book?.status ?? order.status) ??
                tDashboard("orders_unknown_status")
              }
            />
          </div>
        </div>

        <h3 className="mt-5 max-w-[12ch] font-display text-[2rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
          {order.package.name ?? tDashboard("orders_unknown_package")}
        </h3>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
          <div>
            <dt className="font-sans text-[11px] leading-none font-semibold uppercase tracking-[0.12em] text-[#8F8F8F]">
              {tDashboard("orders_table_date")}
            </dt>
            <dd className="mt-2">
              <OrderMetaText>
                {formatDashboardDate(order.createdAt, locale, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }) ?? tDashboard("orders_unknown_date")}
              </OrderMetaText>
            </dd>
          </div>

          <div className="text-right">
            <dt className="font-sans text-[11px] leading-none font-semibold uppercase tracking-[0.12em] text-[#8F8F8F]">
              {tDashboard("orders_table_total")}
            </dt>
            <dd className="mt-2 font-display text-[1.6rem] leading-none font-semibold tracking-[-0.04em] text-white">
              {typeof order.totalAmount === "number"
                ? formatDashboardCurrency(order.totalAmount, locale, order.currency)
                : tDashboard("orders_unknown_total")}
            </dd>
          </div>
        </dl>

        <Link
          href={order.trackingUrl}
          aria-label={`${tDashboard("orders_action_track")}: ${order.orderNumber}`}
          className="font-sans mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/10 bg-[#050505] px-4 py-2 text-sm font-semibold tracking-[0.02em] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#101722] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          {tDashboard("orders_action_track")}
        </Link>
      </div>
    </article>
  );
}

export function DashboardOverviewDeferredSkeleton({
  label,
  announce = true,
}: {
  label: string;
  announce?: boolean;
}) {
  return (
    <div
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-busy={announce || undefined}
      className="space-y-5 md:space-y-7"
    >
      {announce ? <span className="sr-only">{label}</span> : null}
      <div
        className={cn(SURFACE, BELOW_FOLD_SECTION_CLASS, "h-[22rem] animate-pulse bg-[#101010]")}
      />
      <div
        className={cn(SURFACE, BELOW_FOLD_SECTION_CLASS, "h-[21rem] animate-pulse bg-[#101010]")}
      />
      <div
        className={cn(SURFACE, BELOW_FOLD_SECTION_CLASS, "h-[16rem] animate-pulse bg-[#101010]")}
      />
      <div
        className={cn(SURFACE, BELOW_FOLD_SECTION_CLASS, "h-[14rem] animate-pulse bg-[#101010]")}
      />
      <div
        className={cn(SURFACE, BELOW_FOLD_SECTION_CLASS, "h-[18rem] animate-pulse bg-[#101010]")}
      />
    </div>
  );
}
