import { renderHook } from "@testing-library/react";
import { useDashboardOverviewPageData } from "./useDashboardOverviewPageData";

const useDashboardOverviewMock = jest.fn();
const useMyProfileMock = jest.fn();
const useNotificationUnreadCountMock = jest.fn();
const useNotificationBannerStateMock = jest.fn();
const useReviewStateMock = jest.fn();

jest.mock("./useDashboardOverview", () => ({
  useDashboardOverview: () => useDashboardOverviewMock(),
}));

jest.mock("./use-user-profile", () => ({
  useMyProfile: () => useMyProfileMock(),
}));

jest.mock("./use-dashboard-shell-data", () => ({
  useNotificationUnreadCount: () => useNotificationUnreadCountMock(),
  useNotificationBannerState: () => useNotificationBannerStateMock(),
  useReviewState: () => useReviewStateMock(),
}));

describe("useDashboardOverviewPageData", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useDashboardOverviewMock.mockReturnValue({
      activeBook: null,
      recentOrders: [],
      notifications: {
        unreadCount: 2,
        hasProductionDelayBanner: false,
      },
      profile: {
        isProfileComplete: true,
        preferredLanguage: "en",
      },
      pendingActions: {
        total: 1,
        items: [
          {
            type: "REVIEW_BOOK",
            priority: "medium",
            href: "/dashboard/reviews",
            bookId: "cmbook11111111111111111111111",
            orderId: null,
            bookTitle: "From Overview",
            bookStatus: "DELIVERED",
            orderStatus: null,
          },
        ],
      },
      isInitialLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    useMyProfileMock.mockReturnValue({
      profile: {
        isProfileComplete: false,
        preferredLanguage: "fr",
      },
      refetch: jest.fn(),
    });

    useNotificationUnreadCountMock.mockReturnValue({
      unreadCount: 7,
      isFallback: false,
      refetch: jest.fn(),
    });

    useNotificationBannerStateMock.mockReturnValue({
      hasProductionDelayBanner: true,
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    });

    useReviewStateMock.mockReturnValue({
      hasAnyEligibleBook: true,
      hasPendingReviews: true,
      pendingBooks: [
        {
          bookId: "cmbook22222222222222222222222",
          title: "From Review State",
          coverImageUrl: null,
          lifecycleStatus: "DELIVERED",
          reviewStatus: "PENDING",
          review: null,
        },
      ],
      isFetched: true,
      refetch: jest.fn(),
    });
  });

  it("reuses shared profile, notifications, and review state over the overview fallback", () => {
    const { result } = renderHook(() => useDashboardOverviewPageData());

    expect(result.current.profile.isProfileComplete).toBe(false);
    expect(result.current.profile.preferredLanguage).toBe("fr");
    expect(result.current.notifications.unreadCount).toBe(7);
    expect(result.current.notifications.hasProductionDelayBanner).toBe(true);
    expect(result.current.pendingActions.total).toBe(2);
    expect(result.current.pendingActions.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "COMPLETE_PROFILE",
          href: "/dashboard/profile",
        }),
        expect.objectContaining({
          type: "REVIEW_BOOK",
          bookTitle: "From Review State",
        }),
      ])
    );
  });
});
