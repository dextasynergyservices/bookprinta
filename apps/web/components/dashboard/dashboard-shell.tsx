"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotificationBannerState, useReviewState } from "@/hooks/use-dashboard-shell-data";
import { useLenis } from "@/hooks/use-lenis";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useMyProfile } from "@/hooks/use-user-profile";
import { cn } from "@/lib/utils";
import { DashboardCompleteProfileBanner } from "./dashboard-complete-profile-banner";
import { DashboardContentFrame } from "./dashboard-content-frame";
import { DashboardHeader } from "./dashboard-header";
import { DashboardMobileDrawer } from "./dashboard-mobile-drawer";
import { DashboardProductionDelayBanner } from "./dashboard-production-delay-banner";
import {
  DashboardReviewRequestDialog,
  type ReviewRequestDialogTarget,
} from "./dashboard-review-request-dialog";
import { DashboardSidebar } from "./dashboard-sidebar";

type DashboardShellProps = {
  children: React.ReactNode;
};

const DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY = "dashboard_sidebar_collapsed";
const DASHBOARD_REVIEW_DIALOG_DISMISSED_STORAGE_KEY_PREFIX = "dashboard_review_dialog_dismissed:";
const DASHBOARD_COMPLETE_PROFILE_BANNER_DISMISSED_STORAGE_KEY =
  "dashboard_complete_profile_banner_dismissed";

function getReviewDialogDismissedStorageKey(bookId: string) {
  return `${DASHBOARD_REVIEW_DIALOG_DISMISSED_STORAGE_KEY_PREFIX}${bookId}`;
}

function hasReviewDialogBeenDismissedForSession(bookId: string) {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(getReviewDialogDismissedStorageKey(bookId)) === "1";
}

function toDismissedReviewBookIds(pendingBookIds: string[]) {
  if (typeof window === "undefined") return [];
  return pendingBookIds.filter((bookId) => hasReviewDialogBeenDismissedForSession(bookId));
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  return left.every((value, index) => value === right[index]);
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [reviewDialogTarget, setReviewDialogTarget] = useState<ReviewRequestDialogTarget | null>(
    null
  );
  const [dismissedReviewBookIds, setDismissedReviewBookIds] = useState<string[]>([]);
  const [hasHydratedReviewDialogDismissals, setHasHydratedReviewDialogDismissals] = useState(false);
  const [isCompleteProfileBannerDismissed, setIsCompleteProfileBannerDismissed] = useState(false);
  const [hasHydratedCompleteProfileBannerDismissal, setHasHydratedCompleteProfileBannerDismissal] =
    useState(false);
  const { lenis } = useLenis();
  const prefersReducedMotion = useReducedMotion();
  const { hasProductionDelayBanner } = useNotificationBannerState();
  const { pendingBooks } = useReviewState();
  const { profile } = useMyProfile();
  const submittedReviewBookIdRef = useRef<string | null>(null);
  const toggleDesktopSidebar = useCallback(() => {
    setIsDesktopSidebarCollapsed((previous) => !previous);
  }, []);
  const isReviewDialogOpen = reviewDialogTarget !== null;
  const desktopSidebarWidth = useMemo(
    () => (isDesktopSidebarCollapsed ? "6rem" : "18rem"),
    [isDesktopSidebarCollapsed]
  );
  const pendingReviewBookIds = useMemo(
    () => pendingBooks.map((book) => book.bookId),
    [pendingBooks]
  );
  const syncDismissedReviewBookIds = useCallback((pendingBookIds: string[]) => {
    const nextDismissedReviewBookIds = toDismissedReviewBookIds(pendingBookIds);
    setDismissedReviewBookIds((current) =>
      areStringArraysEqual(current, nextDismissedReviewBookIds)
        ? current
        : nextDismissedReviewBookIds
    );
    setHasHydratedReviewDialogDismissals(true);
  }, []);
  const dismissReviewDialogForSession = useCallback((bookId: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(getReviewDialogDismissedStorageKey(bookId), "1");
    setDismissedReviewBookIds((current) =>
      current.includes(bookId) ? current : [...current, bookId]
    );
  }, []);
  const clearDismissedReviewDialogForSession = useCallback((bookId: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(getReviewDialogDismissedStorageKey(bookId));
    setDismissedReviewBookIds((current) =>
      current.filter((currentBookId) => currentBookId !== bookId)
    );
  }, []);
  const handleOpenReviewDialog = useCallback(
    (
      target: ReviewRequestDialogTarget,
      options?: {
        source?: "auto" | "manual";
      }
    ) => {
      if (options?.source === "auto" && dismissedReviewBookIds.includes(target.bookId)) {
        return;
      }

      setReviewDialogTarget(target);
      setIsMobileDrawerOpen(false);
    },
    [dismissedReviewBookIds]
  );
  const handleReviewDialogSubmitted = useCallback(
    (bookId: string) => {
      submittedReviewBookIdRef.current = bookId;
      clearDismissedReviewDialogForSession(bookId);
    },
    [clearDismissedReviewDialogForSession]
  );
  const handleReviewDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;

      if (reviewDialogTarget && submittedReviewBookIdRef.current !== reviewDialogTarget.bookId) {
        dismissReviewDialogForSession(reviewDialogTarget.bookId);
      }

      if (submittedReviewBookIdRef.current === reviewDialogTarget?.bookId) {
        submittedReviewBookIdRef.current = null;
      }

      setReviewDialogTarget(null);
    },
    [dismissReviewDialogForSession, reviewDialogTarget]
  );
  const autoOpenReviewDialogTarget = useMemo(() => {
    if (!hasHydratedReviewDialogDismissals) return null;

    const nextPendingBook = pendingBooks.find(
      (book) => !dismissedReviewBookIds.includes(book.bookId)
    );

    return nextPendingBook
      ? {
          bookId: nextPendingBook.bookId,
          bookTitle: nextPendingBook.title,
        }
      : null;
  }, [dismissedReviewBookIds, hasHydratedReviewDialogDismissals, pendingBooks]);
  const shouldShowCompleteProfileBanner = useMemo(() => {
    if (!hasHydratedCompleteProfileBannerDismissal) {
      return false;
    }

    if (!profile || profile.isProfileComplete) {
      return false;
    }

    return !isCompleteProfileBannerDismissed;
  }, [hasHydratedCompleteProfileBannerDismissal, isCompleteProfileBannerDismissed, profile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY);
    setIsDesktopSidebarCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsCompleteProfileBannerDismissed(
      window.sessionStorage.getItem(DASHBOARD_COMPLETE_PROFILE_BANNER_DISMISSED_STORAGE_KEY) === "1"
    );
    setHasHydratedCompleteProfileBannerDismissal(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY,
      isDesktopSidebarCollapsed ? "1" : "0"
    );
  }, [isDesktopSidebarCollapsed]);

  useEffect(() => {
    syncDismissedReviewBookIds(pendingReviewBookIds);
  }, [pendingReviewBookIds, syncDismissedReviewBookIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !profile?.isProfileComplete) {
      return;
    }

    window.sessionStorage.removeItem(DASHBOARD_COMPLETE_PROFILE_BANNER_DISMISSED_STORAGE_KEY);
    setIsCompleteProfileBannerDismissed(false);
  }, [profile?.isProfileComplete]);

  useEffect(() => {
    if (!autoOpenReviewDialogTarget || reviewDialogTarget) {
      return;
    }

    handleOpenReviewDialog(autoOpenReviewDialogTarget, { source: "auto" });
  }, [autoOpenReviewDialogTarget, handleOpenReviewDialog, reviewDialogTarget]);

  useEffect(() => {
    if (!lenis || prefersReducedMotion) return;

    if (isMobileDrawerOpen || isReviewDialogOpen) {
      lenis.stop();
      return () => {
        lenis.start();
      };
    }

    lenis.start();

    return () => {
      lenis.start();
    };
  }, [isMobileDrawerOpen, isReviewDialogOpen, lenis, prefersReducedMotion]);

  const dismissCompleteProfileBannerForSession = useCallback(() => {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(DASHBOARD_COMPLETE_PROFILE_BANNER_DISMISSED_STORAGE_KEY, "1");
    setIsCompleteProfileBannerDismissed(true);
  }, []);

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-[#000000] text-white"
      style={
        {
          "--dashboard-sidebar-width": desktopSidebarWidth,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 42% at 18% 0%, rgba(0,126,255,0.10) 0%, rgba(0,0,0,0) 68%)",
        }}
      />

      <aside
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-[var(--dashboard-sidebar-width)] lg:overflow-hidden lg:border-r lg:border-[#2A2A2A] lg:transition-[width] lg:duration-200 lg:ease-out"
        )}
        data-collapsed={isDesktopSidebarCollapsed ? "true" : "false"}
      >
        <DashboardSidebar
          isCollapsed={isDesktopSidebarCollapsed}
          onToggleCollapse={toggleDesktopSidebar}
          onOpenReviewDialog={handleOpenReviewDialog}
        />
      </aside>

      <div
        className={cn(
          "relative min-h-screen lg:pl-[var(--dashboard-sidebar-width)] lg:transition-[padding] lg:duration-200 lg:ease-out"
        )}
      >
        <div className="flex min-h-screen flex-col">
          <DashboardHeader
            onOpenMobileMenu={() => setIsMobileDrawerOpen(true)}
            isMobileMenuOpen={isMobileDrawerOpen}
            onOpenReviewDialog={handleOpenReviewDialog}
          />

          {hasProductionDelayBanner ? <DashboardProductionDelayBanner /> : null}
          {shouldShowCompleteProfileBanner ? (
            <DashboardCompleteProfileBanner onDismiss={dismissCompleteProfileBannerForSession} />
          ) : null}

          <main
            id="main-content"
            tabIndex={-1}
            className="relative min-h-[calc(100vh-4rem)] min-w-0 overflow-x-hidden lg:min-h-[calc(100vh-5rem)]"
          >
            <DashboardContentFrame>{children}</DashboardContentFrame>
          </main>
        </div>
      </div>

      <DashboardMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        onOpenReviewDialog={handleOpenReviewDialog}
      />

      <DashboardReviewRequestDialog
        open={isReviewDialogOpen}
        target={reviewDialogTarget}
        onOpenChange={handleReviewDialogOpenChange}
        onReviewSubmitted={handleReviewDialogSubmitted}
      />
    </div>
  );
}
