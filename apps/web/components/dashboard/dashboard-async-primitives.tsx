"use client";

import { AlertCircle } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DivProps = ComponentPropsWithoutRef<"div">;
type SectionProps = ComponentPropsWithoutRef<"section">;

export function DashboardSkeletonBlock({ className, ...props }: DivProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded bg-[#2A2A2A]", className)}
      {...props}
    />
  );
}

export function BookCardSkeleton({ className, ...props }: DivProps) {
  return (
    <div
      data-dashboard-skeleton="book-card"
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4",
        className
      )}
      {...props}
    >
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4">
        <DashboardSkeletonBlock className="aspect-[3/4] rounded-[20px]" />
        <div className="space-y-3 pt-2">
          <DashboardSkeletonBlock className="h-5 w-2/3 rounded-full" />
          <DashboardSkeletonBlock className="h-4 w-1/2 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function OrderRowSkeleton({ className, ...props }: DivProps) {
  return (
    <div
      data-dashboard-skeleton="order-row"
      aria-hidden="true"
      className={cn("w-full rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4", className)}
      {...props}
    >
      <div className="grid gap-3 md:grid-cols-[1.15fr_1fr_0.8fr_0.8fr_0.9fr_0.85fr] md:items-center">
        <DashboardSkeletonBlock className="h-4 w-28 rounded-full" />
        <DashboardSkeletonBlock className="h-4 w-36 rounded-full" />
        <DashboardSkeletonBlock className="h-6 w-24 rounded-full" />
        <DashboardSkeletonBlock className="h-4 w-24 rounded-full" />
        <DashboardSkeletonBlock className="h-4 w-20 rounded-full md:ml-auto" />
        <DashboardSkeletonBlock className="h-10 w-full rounded-full md:ml-auto md:w-28" />
      </div>
    </div>
  );
}

export function NotificationItemSkeleton({ className, ...props }: DivProps) {
  return (
    <div
      data-dashboard-skeleton="notification-item"
      aria-hidden="true"
      className={cn(
        "flex items-start gap-3 rounded-[24px] border border-[#2A2A2A] bg-[#111111] px-4 py-4",
        className
      )}
      {...props}
    >
      <DashboardSkeletonBlock className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        <DashboardSkeletonBlock className="h-4 w-2/3 rounded-full" />
        <DashboardSkeletonBlock className="h-4 w-full rounded-full" />
      </div>
    </div>
  );
}

type ProfileSkeletonProps = SectionProps & {
  fieldCount?: number;
};

export function ProfileSkeleton({ className, fieldCount = 4, ...props }: ProfileSkeletonProps) {
  const fieldKeys = Array.from(
    { length: fieldCount },
    (_unused, index) => `profile-field-${index + 1}`
  );

  return (
    <section
      data-dashboard-skeleton="profile"
      className={cn("grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]", className)}
      {...props}
    >
      <div className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
        <DashboardSkeletonBlock className="mx-auto h-44 w-44 rounded-full" />
      </div>
      <div className="grid gap-4">
        {fieldKeys.map((key) => (
          <div key={key} className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
            <DashboardSkeletonBlock className="h-4 w-28 rounded-full" />
            <DashboardSkeletonBlock className="mt-4 h-20 w-full rounded-[24px]" />
          </div>
        ))}
      </div>
    </section>
  );
}

type DashboardErrorStateProps = SectionProps & {
  title: string;
  description: string;
  retryLabel: string;
  loadingLabel: string;
  onRetry: () => void;
  isRetrying?: boolean;
};

export function DashboardErrorState({
  className,
  title,
  description,
  retryLabel,
  loadingLabel,
  onRetry,
  isRetrying = false,
  ...props
}: DashboardErrorStateProps) {
  return (
    <section
      data-dashboard-error-state="true"
      role="alert"
      className={cn(
        "flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-[#ef4444]/35 bg-[#111111] px-6 py-8 text-center",
        className
      )}
      {...props}
    >
      <div className="inline-flex size-14 items-center justify-center rounded-full border border-[#ef4444]/25 bg-[#140909] text-[#ef4444]">
        <AlertCircle className="size-5" aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-sans text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-md font-sans text-sm leading-6 text-[#d0d0d0]">{description}</p>
      <Button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="mt-6 min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white hover:bg-[#0a72df]"
      >
        {isRetrying ? loadingLabel : retryLabel}
      </Button>
    </section>
  );
}
