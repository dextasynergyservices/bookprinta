import { cn } from "@/lib/utils";

type DashboardContentFrameProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Shared content canvas for all dashboard routes.
 * Keeps spacing and width consistent and reserves a sticky offset token
 * for future table headers under the persistent dashboard header.
 */
export function DashboardContentFrame({ children, className }: DashboardContentFrameProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 max-w-[1280px] flex-1 flex-col gap-4 px-4 py-5 md:gap-6 md:px-6 md:py-7 lg:px-8 lg:py-8",
        "[--dashboard-sticky-offset:calc(env(safe-area-inset-top)+3.5rem)] md:[--dashboard-sticky-offset:calc(env(safe-area-inset-top)+4rem)] lg:[--dashboard-sticky-offset:calc(env(safe-area-inset-top)+5rem)]",
        className
      )}
    >
      {children}
    </div>
  );
}

type DashboardTableViewportProps = {
  children: React.ReactNode;
  className?: string;
  minWidthClassName?: string;
};

/**
 * Horizontal overflow container intended for TanStack tables (`md+`).
 * Provides safe mobile overflow behavior and sticky-header offset support.
 */
export function DashboardTableViewport({
  children,
  className,
  minWidthClassName = "md:min-w-[760px]",
}: DashboardTableViewportProps) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-x-auto overscroll-x-contain rounded-2xl border border-[#2A2A2A] bg-[#0A0A0A]",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      data-lenis-prevent
    >
      <div className={cn("min-w-full", minWidthClassName)}>{children}</div>
    </div>
  );
}

type DashboardResponsiveDataRegionProps = {
  mobileCards: React.ReactNode;
  desktopTable: React.ReactNode;
  className?: string;
};

/**
 * Canonical dashboard data pattern from CLAUDE.md:
 * cards on mobile, table from `md` and above.
 */
export function DashboardResponsiveDataRegion({
  mobileCards,
  desktopTable,
  className,
}: DashboardResponsiveDataRegionProps) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="grid gap-3 md:hidden">{mobileCards}</div>
      <div className="hidden md:block">{desktopTable}</div>
    </section>
  );
}

export const DASHBOARD_STICKY_TABLE_HEADER_CLASS =
  "sticky top-[var(--dashboard-sticky-offset)] z-20 bg-[#0A0A0A]";
