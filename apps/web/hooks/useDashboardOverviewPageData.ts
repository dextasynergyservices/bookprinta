"use client";

import type { DashboardPendingAction, ReviewBook } from "@bookprinta/shared";
import { useMemo } from "react";
import {
  useNotificationBannerState,
  useNotificationUnreadCount,
  useReviewState,
} from "@/hooks/use-dashboard-shell-data";
import { useMyProfile } from "@/hooks/use-user-profile";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";

const PENDING_ACTION_PRIORITY_ORDER: Record<DashboardPendingAction["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function mergeDashboardPendingActions(params: {
  overviewActions: DashboardPendingAction[];
  isProfileComplete: boolean;
  pendingReviewBook: ReviewBook | null;
  overrideProfileAction: boolean;
  overrideReviewAction: boolean;
}) {
  const nextActions = params.overviewActions.filter((action) => {
    if (params.overrideProfileAction && action.type === "COMPLETE_PROFILE") {
      return false;
    }

    if (params.overrideReviewAction && action.type === "REVIEW_BOOK") {
      return false;
    }

    return true;
  });

  if (params.overrideProfileAction && !params.isProfileComplete) {
    nextActions.push({
      type: "COMPLETE_PROFILE",
      priority: "medium",
      href: "/dashboard/profile",
      bookId: null,
      orderId: null,
      bookTitle: null,
      bookStatus: null,
      orderStatus: null,
    });
  }

  if (params.overrideReviewAction && params.pendingReviewBook) {
    nextActions.push({
      type: "REVIEW_BOOK",
      priority: "medium",
      href: "/dashboard/reviews",
      bookId: params.pendingReviewBook.bookId,
      orderId: null,
      bookTitle: params.pendingReviewBook.title,
      bookStatus: params.pendingReviewBook.lifecycleStatus,
      orderStatus: null,
    });
  }

  return nextActions.sort((left, right) => {
    const priorityScore =
      PENDING_ACTION_PRIORITY_ORDER[left.priority] - PENDING_ACTION_PRIORITY_ORDER[right.priority];

    if (priorityScore !== 0) {
      return priorityScore;
    }

    return left.href.localeCompare(right.href);
  });
}

export function useDashboardOverviewPageData() {
  const overviewQuery = useDashboardOverview();
  const profileQuery = useMyProfile();
  const unreadCountQuery = useNotificationUnreadCount();
  const notificationBannerQuery = useNotificationBannerState();
  const reviewStateQuery = useReviewState();

  const profile = useMemo(
    () => ({
      isProfileComplete:
        profileQuery.profile?.isProfileComplete ?? overviewQuery.profile.isProfileComplete,
      preferredLanguage:
        profileQuery.profile?.preferredLanguage ?? overviewQuery.profile.preferredLanguage,
    }),
    [
      overviewQuery.profile.isProfileComplete,
      overviewQuery.profile.preferredLanguage,
      profileQuery.profile,
    ]
  );

  const notifications = useMemo(
    () => ({
      unreadCount: unreadCountQuery.isFallback
        ? overviewQuery.notifications.unreadCount
        : unreadCountQuery.unreadCount,
      hasProductionDelayBanner:
        notificationBannerQuery.isPending || notificationBannerQuery.isError
          ? overviewQuery.notifications.hasProductionDelayBanner
          : notificationBannerQuery.hasProductionDelayBanner,
    }),
    [
      notificationBannerQuery.hasProductionDelayBanner,
      notificationBannerQuery.isError,
      notificationBannerQuery.isPending,
      overviewQuery.notifications.hasProductionDelayBanner,
      overviewQuery.notifications.unreadCount,
      unreadCountQuery.isFallback,
      unreadCountQuery.unreadCount,
    ]
  );

  const pendingActionsItems = useMemo(
    () =>
      mergeDashboardPendingActions({
        overviewActions: overviewQuery.pendingActions.items,
        isProfileComplete: profile.isProfileComplete,
        pendingReviewBook: reviewStateQuery.pendingBooks[0] ?? null,
        overrideProfileAction: profileQuery.profile !== null,
        overrideReviewAction: reviewStateQuery.isFetched,
      }),
    [
      overviewQuery.pendingActions.items,
      profile.isProfileComplete,
      profileQuery.profile,
      reviewStateQuery.isFetched,
      reviewStateQuery.pendingBooks,
    ]
  );

  return {
    ...overviewQuery,
    activeBook: overviewQuery.activeBook,
    recentOrders: overviewQuery.recentOrders,
    notifications,
    profile,
    pendingActions: {
      total: pendingActionsItems.length,
      items: pendingActionsItems,
    },
    reviewState: {
      hasAnyEligibleBook: reviewStateQuery.hasAnyEligibleBook,
      hasPendingReviews: reviewStateQuery.hasPendingReviews,
      pendingBooks: reviewStateQuery.pendingBooks,
    },
    refetch: async () => {
      await Promise.allSettled([
        overviewQuery.refetch(),
        profileQuery.refetch(),
        unreadCountQuery.refetch(),
        notificationBannerQuery.refetch(),
        reviewStateQuery.refetch(),
      ]);
    },
  };
}
