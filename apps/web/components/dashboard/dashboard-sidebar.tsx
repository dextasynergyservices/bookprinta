"use client";

import { BookOpenText, Cog, Lock, MessageSquareText, Package, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasAnyPrintedBook } from "@/hooks/use-dashboard-shell-data";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type SidebarItem = {
  href: string;
  labelKey: "my_books" | "orders" | "profile" | "settings" | "reviews";
  icon: React.ComponentType<{ className?: string }>;
  matchMode: "exact" | "prefix";
};

type DashboardSidebarProps = {
  className?: string;
  onNavigate?: () => void;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
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

export function DashboardSidebar({ className, onNavigate }: DashboardSidebarProps) {
  const tDashboard = useTranslations("dashboard");
  const pathname = usePathname();
  const {
    hasAnyPrintedBook,
    isLoading: isReviewEligibilityLoading,
    isError: isReviewEligibilityError,
    isFallback: isReviewEligibilityFallback,
  } = useHasAnyPrintedBook();
  const reviewsLockedTooltip = isReviewEligibilityLoading
    ? tDashboard("reviews_eligibility_loading")
    : isReviewEligibilityError || isReviewEligibilityFallback
      ? tDashboard("reviews_eligibility_unavailable")
      : tDashboard("reviews_disabled_tooltip");

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-[linear-gradient(180deg,#111111_0%,#0A0A0A_100%)]",
        className
      )}
    >
      <div className="border-b border-[#2A2A2A] px-5 py-6">
        <p className="font-display text-xl font-semibold tracking-tight text-white">
          {tDashboard("title")}
        </p>
      </div>

      <TooltipProvider delayDuration={120}>
        <nav aria-label={tDashboard("sidebar_navigation_aria")} className="px-3 py-4">
          <ul className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive = isItemActive(pathname, item);
              const isReviewsItem = item.labelKey === "reviews";
              const isReviewsLocked = isReviewsItem && !hasAnyPrintedBook;
              const Icon = item.icon;

              const link = (
                <Link
                  href={item.href}
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
                    "font-sans flex min-h-11 items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
                    isReviewsLocked
                      ? "cursor-not-allowed border-l-transparent bg-[#2A2A2A] text-[#919191] hover:bg-[#2A2A2A] hover:text-[#919191]"
                      : isActive
                        ? "border-l-[#007eff] bg-[#1a1a1a] text-white"
                        : "border-l-transparent text-white hover:bg-[#141414] hover:text-white"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{tDashboard(item.labelKey)}</span>
                  {isReviewsLocked ? (
                    <Lock className="ml-auto size-4 shrink-0 text-[#919191]" aria-hidden="true" />
                  ) : null}
                </Link>
              );

              return (
                <li key={item.href}>
                  {isReviewsLocked ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {reviewsLockedTooltip}
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
