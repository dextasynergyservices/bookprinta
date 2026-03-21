"use client";

import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Cog,
  LayoutDashboard,
  Lock,
  MessageSquareText,
  Package,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useReviewState } from "@/hooks/use-dashboard-shell-data";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type SidebarItem = {
  href: string;
  labelKey: "title" | "my_books" | "orders" | "profile" | "settings" | "reviews";
  icon: React.ComponentType<{ className?: string }>;
  matchMode: "exact" | "prefix";
};

type DashboardSidebarProps = {
  className?: string;
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenReviewDialog?: (target: { bookId: string; bookTitle: string | null }) => void;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { href: "/dashboard", labelKey: "title", icon: LayoutDashboard, matchMode: "exact" },
  { href: "/dashboard/books", labelKey: "my_books", icon: BookOpenText, matchMode: "prefix" },
  { href: "/dashboard/orders", labelKey: "orders", icon: Package, matchMode: "prefix" },
  { href: "/dashboard/profile", labelKey: "profile", icon: UserRound, matchMode: "prefix" },
  { href: "/dashboard/settings", labelKey: "settings", icon: Cog, matchMode: "prefix" },
  {
    href: "/dashboard/reviews",
    labelKey: "reviews",
    icon: MessageSquareText,
    matchMode: "prefix",
  },
];

function isItemActive(pathname: string, item: SidebarItem) {
  if (item.matchMode === "exact") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function DashboardSidebar({
  className,
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
  onOpenReviewDialog: _onOpenReviewDialog,
}: DashboardSidebarProps) {
  const tDashboard = useTranslations("dashboard");
  const pathname = usePathname();
  const {
    hasAnyEligibleBook,
    isLoading: isReviewEligibilityLoading,
    isError: isReviewEligibilityError,
    isFallback: isReviewEligibilityFallback,
  } = useReviewState();
  const isReviewEligibilityUnavailable = isReviewEligibilityError || isReviewEligibilityFallback;
  const reviewsLockedTooltip = isReviewEligibilityLoading
    ? tDashboard("reviews_eligibility_loading")
    : isReviewEligibilityUnavailable
      ? tDashboard("reviews_eligibility_unavailable")
      : tDashboard("reviews_disabled_tooltip");
  const canCollapseDesktop = !onNavigate && typeof onToggleCollapse === "function";
  const collapseAriaLabel = isCollapsed
    ? tDashboard("sidebar_expand_aria")
    : tDashboard("sidebar_collapse_aria");
  const CollapseIcon = isCollapsed ? ChevronRight : ChevronLeft;

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-[linear-gradient(180deg,#111111_0%,#0A0A0A_100%)]",
        className
      )}
    >
      <div className={cn("border-b border-[#2A2A2A] py-6", isCollapsed ? "px-3" : "px-5")}>
        <div
          className={cn(
            "flex items-center gap-2",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {isCollapsed ? (
            <Image
              src="/icons/icon-192.png"
              alt="BookPrinta"
              width={32}
              height={32}
              className="size-8 rounded"
            />
          ) : (
            <Link href="/dashboard" className="min-w-0">
              <Image
                src="/logo-main-white.png"
                alt="BookPrinta"
                width={140}
                height={36}
                className="h-9 w-auto"
              />
            </Link>
          )}

          {canCollapseDesktop ? (
            <button
              type="button"
              aria-pressed={isCollapsed}
              aria-label={collapseAriaLabel}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleCollapse?.();
              }}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
            >
              <CollapseIcon className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <TooltipProvider delayDuration={120}>
        <nav
          aria-label={tDashboard("sidebar_navigation_aria")}
          className={cn("px-3 py-4", isCollapsed ? "px-2" : "px-3")}
        >
          <ul className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive = isItemActive(pathname, item);
              const isReviewsItem = item.labelKey === "reviews";
              const isReviewsLocked =
                isReviewsItem &&
                !isReviewEligibilityLoading &&
                !isReviewEligibilityUnavailable &&
                !hasAnyEligibleBook;
              const shouldShowReviewsAvailabilityTooltip =
                isReviewsItem &&
                (isReviewsLocked || isReviewEligibilityLoading || isReviewEligibilityUnavailable);
              const Icon = item.icon;
              const itemLabel = tDashboard(item.labelKey);
              const tooltipLabel = shouldShowReviewsAvailabilityTooltip
                ? `${itemLabel} - ${reviewsLockedTooltip}`
                : isCollapsed
                  ? itemLabel
                  : null;

              const link = (
                <Link
                  href={item.href}
                  aria-label={itemLabel}
                  title={isCollapsed ? itemLabel : undefined}
                  aria-current={isActive ? "page" : undefined}
                  aria-disabled={isReviewsLocked || undefined}
                  onClick={(event) => {
                    if (isReviewsLocked) {
                      event.preventDefault();
                      return;
                    }

                    onNavigate?.();
                  }}
                  className={cn(
                    "font-sans flex min-h-11 items-center gap-3 border-l-2 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
                    isCollapsed ? "justify-center px-2" : "px-3",
                    isReviewsLocked
                      ? "cursor-not-allowed border-l-transparent bg-[#2A2A2A] text-[#919191] hover:bg-[#2A2A2A] hover:text-[#919191]"
                      : isActive
                        ? "border-l-[#007eff] bg-[#1a1a1a] text-white"
                        : "border-l-transparent text-white hover:bg-[#141414] hover:text-white"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className={cn(isCollapsed ? "sr-only" : "truncate")}>{itemLabel}</span>
                  {isReviewsLocked && !isCollapsed ? (
                    <Lock className="ml-auto size-4 shrink-0 text-[#919191]" aria-hidden="true" />
                  ) : null}
                </Link>
              );

              return (
                <li key={item.href}>
                  {tooltipLabel ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {tooltipLabel}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </TooltipProvider>
    </div>
  );
}
