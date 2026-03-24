"use client";

import type { DashboardPendingAction, UserBookListItem } from "@bookprinta/shared";
import { ArrowRight, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { DashboardErrorState } from "@/components/dashboard/dashboard-async-primitives";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useDashboardOverviewPageData } from "@/hooks/useDashboardOverviewPageData";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  DashboardOverviewDeferredSkeleton,
  EYEBROW_PILL_CLASS,
  Metric,
  PAGE_AMBIENT_STYLE,
  PRIMARY_BUTTON_CLASS,
  SECTION_REVEAL_CLASS,
  SURFACE,
} from "./dashboard-overview-shared";

function DashboardOverviewDeferredSectionsLoading() {
  const tCommon = useTranslations("common");

  return <DashboardOverviewDeferredSkeleton label={tCommon("loading")} />;
}

const DashboardOverviewDeferredSections = dynamic(
  () =>
    import("./dashboard-overview-deferred-sections").then(
      (mod) => mod.DashboardOverviewDeferredSections
    ),
  {
    ssr: false,
    loading: DashboardOverviewDeferredSectionsLoading,
  }
);

function resolveActionCopy(
  action: DashboardPendingAction,
  tDashboard: ReturnType<typeof useTranslations>
) {
  switch (action.type) {
    case "UPLOAD_MANUSCRIPT":
      return {
        title: tDashboard("overview_action_upload_title"),
        description: tDashboard("overview_action_upload_description"),
        cta: tDashboard("upload_manuscript"),
      };
    case "REVIEW_PREVIEW":
      return {
        title: tDashboard("overview_action_review_preview_title"),
        description: tDashboard("overview_action_review_preview_description"),
        cta: tDashboard("book_progress_cta_review_preview"),
      };
    case "PAY_EXTRA_PAGES":
      return {
        title: tDashboard("overview_action_pay_extra_title"),
        description: tDashboard("overview_action_pay_extra_description"),
        cta: tDashboard("book_progress_billing_gate_pay_cta"),
      };
    case "COMPLETE_PROFILE":
      return {
        title: tDashboard("overview_action_complete_profile_title"),
        description: tDashboard("overview_action_complete_profile_description"),
        cta: tDashboard("complete_profile_cta"),
      };
    case "REVIEW_BOOK":
      return {
        title: tDashboard("overview_action_review_book_title"),
        description: tDashboard("overview_action_review_book_description"),
        cta: tDashboard("review_submit"),
      };
    case "RESOLVE_MANUSCRIPT_ISSUE":
      return {
        title: tDashboard("overview_action_resolve_issue_title"),
        description: tDashboard("overview_action_resolve_issue_description"),
        cta: tDashboard("overview_action_resolve_issue_cta"),
      };
    default:
      return {
        title: tDashboard("overview_next_action_idle_title"),
        description: tDashboard("overview_next_action_idle_description"),
        cta: tDashboard("overview_next_action_idle_cta"),
      };
  }
}

function resolveNextAction(
  pendingActions: DashboardPendingAction[],
  activeBook: UserBookListItem | null,
  tDashboard: ReturnType<typeof useTranslations>
) {
  const primaryPendingAction = pendingActions[0] ?? null;
  if (primaryPendingAction) {
    const copy = resolveActionCopy(primaryPendingAction, tDashboard);
    return { href: primaryPendingAction.href, ...copy };
  }

  if (activeBook) {
    return {
      href: activeBook.workspaceUrl,
      title: tDashboard("overview_next_action_continue_title"),
      description: tDashboard("overview_next_action_continue_description"),
      cta: tDashboard("book_progress_cta_open_workspace"),
    };
  }

  return {
    href: "/pricing",
    title: tDashboard("overview_next_action_idle_title"),
    description: tDashboard("overview_next_action_idle_description"),
    cta: tDashboard("overview_next_action_idle_cta"),
  };
}

function DashboardOverviewSkeleton() {
  const tCommon = useTranslations("common");

  return (
    <section aria-busy="true" aria-live="polite" className="relative min-w-0">
      <p className="sr-only">{tCommon("loading")}</p>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={PAGE_AMBIENT_STYLE}
      />
      <div className="relative space-y-5 md:space-y-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.86fr)]">
          <div className={cn(SURFACE, "h-[24rem] animate-pulse bg-[#101010]")} />
          <div className={cn(SURFACE, "h-[20rem] animate-pulse bg-[#101010]")} />
        </div>
        <DashboardOverviewDeferredSkeleton label={tCommon("loading")} announce={false} />
      </div>
    </section>
  );
}

export function DashboardOverviewView() {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { user } = useAuthSession();
  const overviewQuery = useDashboardOverviewPageData();
  const heroTitleId = useId();
  const heroDescriptionId = useId();
  const nextActionTitleId = useId();
  const nextActionDescriptionId = useId();

  if (overviewQuery.isInitialLoading) {
    return <DashboardOverviewSkeleton />;
  }

  if (overviewQuery.isError) {
    return (
      <DashboardErrorState
        className="mx-auto max-w-3xl rounded-[32px]"
        title={tDashboard("overview_error_title")}
        description={tDashboard("overview_error_description")}
        retryLabel={tCommon("retry")}
        loadingLabel={tCommon("loading")}
        onRetry={() => {
          void overviewQuery.refetch();
        }}
      />
    );
  }

  const { activeBook, notifications, pendingActions, profile, recentOrders } = overviewQuery;
  const displayName = user?.displayName ?? tDashboard("header_guest");
  const nextAction = resolveNextAction(pendingActions.items, activeBook, tDashboard);

  return (
    <section className="relative min-w-0" aria-labelledby={heroTitleId}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={PAGE_AMBIENT_STYLE}
      />
      <div className="relative space-y-5 md:space-y-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.86fr)]">
          <article
            aria-labelledby={nextActionTitleId}
            aria-describedby={nextActionDescriptionId}
            className={cn(SURFACE, SECTION_REVEAL_CLASS, "bg-[#0A1017]")}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,126,255,0.22) 0%, rgba(14,19,26,0) 60%), radial-gradient(56% 44% at 0% 0%, rgba(0,126,255,0.18) 0%, rgba(0,0,0,0) 70%)",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#007eff]/0 via-[#007eff]/70 to-[#007eff]/0"
            />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p className={EYEBROW_PILL_CLASS}>{tDashboard("overview_next_action_eyebrow")}</p>
                <div className="mt-4 inline-flex min-h-9 items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2">
                  <span className="font-display text-xl font-semibold tracking-[-0.05em] text-white">
                    {pendingActions.total}
                  </span>
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A7B4C5]">
                    {tDashboard("overview_actions_metric")}
                  </span>
                </div>
                <h1
                  id={nextActionTitleId}
                  className="font-display mt-5 max-w-[11ch] text-[clamp(3rem,14vw,6.1rem)] leading-[0.9] font-semibold tracking-[-0.06em] text-white"
                >
                  {nextAction.title}
                </h1>
                <p
                  id={nextActionDescriptionId}
                  className="mt-4 max-w-[30rem] font-serif text-base leading-7 text-[#D0D7E2] md:text-lg"
                >
                  {nextAction.description}
                </p>
              </div>
              <div className="mt-8">
                <Button asChild className={PRIMARY_BUTTON_CLASS}>
                  <Link
                    href={nextAction.href}
                    aria-label={`${nextAction.cta}: ${nextAction.title}`}
                  >
                    {nextAction.cta}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          </article>

          <article
            aria-labelledby={heroTitleId}
            aria-describedby={heroDescriptionId}
            className={cn(SURFACE, SECTION_REVEAL_CLASS, "bg-[#060606]")}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,126,255,0.16) 0%, rgba(0,0,0,0) 32%), radial-gradient(62% 58% at 0% 0%, rgba(0,126,255,0.18) 0%, rgba(0,0,0,0) 72%)",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 bottom-0 h-40 w-40 rounded-full bg-[#007eff]/8 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className={EYEBROW_PILL_CLASS}>
                    {tDashboard("overview_welcome_back", { name: displayName })}
                  </p>
                  <h2
                    id={heroTitleId}
                    className="font-display mt-5 max-w-[10ch] text-[2.6rem] leading-[0.94] font-semibold tracking-[-0.05em] text-white md:text-[3.3rem]"
                  >
                    {tDashboard("overview_editorial_title")}
                  </h2>
                  <p
                    id={heroDescriptionId}
                    className="mt-4 max-w-[26rem] font-serif text-base leading-7 text-[#CFCFCF]"
                  >
                    {tDashboard("overview_editorial_description")}
                  </p>
                </div>

                <span
                  aria-hidden="true"
                  className="hidden size-16 shrink-0 items-center justify-center rounded-full border border-[#007eff]/20 bg-[#07101A] text-[#9FD0FF] shadow-[0_12px_32px_rgba(0,126,255,0.18)] lg:inline-flex"
                >
                  <Sparkles className="size-5" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-8 grid gap-3 md:grid-cols-3">
                <Metric
                  label={tDashboard("overview_metric_active_book")}
                  value={activeBook ? "1" : "0"}
                  tone="accent"
                />
                <Metric
                  label={tDashboard("overview_metric_recent_orders")}
                  value={String(recentOrders.length)}
                />
                <Metric
                  label={tDashboard("overview_metric_unread_updates")}
                  value={String(notifications.unreadCount)}
                />
              </div>
            </div>
          </article>
        </div>

        <DashboardOverviewDeferredSections
          activeBook={activeBook}
          recentOrders={recentOrders}
          notifications={notifications}
          profile={profile}
          pendingActions={pendingActions}
        />
      </div>
    </section>
  );
}
