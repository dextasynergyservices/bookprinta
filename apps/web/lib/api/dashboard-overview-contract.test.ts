import {
  createEmptyDashboardOverviewResponse,
  normalizeDashboardOverviewPayload,
} from "./dashboard-overview-contract";

describe("normalizeDashboardOverviewPayload", () => {
  it("returns the typed overview response when the payload matches the shared schema", () => {
    const payload = {
      activeBook: null,
      recentOrders: [],
      notifications: {
        unreadCount: 3,
        hasProductionDelayBanner: true,
      },
      profile: {
        isProfileComplete: false,
        preferredLanguage: "en",
      },
      pendingActions: {
        total: 1,
        items: [
          {
            type: "COMPLETE_PROFILE",
            priority: "medium",
            href: "/dashboard/profile",
            bookId: null,
            orderId: null,
            bookTitle: null,
            bookStatus: null,
            orderStatus: null,
          },
        ],
      },
    };

    expect(normalizeDashboardOverviewPayload(payload)).toEqual(payload);
  });

  it("supports nested overview payloads and falls back to the empty contract when invalid", () => {
    expect(
      normalizeDashboardOverviewPayload({
        data: createEmptyDashboardOverviewResponse(),
      })
    ).toEqual(createEmptyDashboardOverviewResponse());

    expect(normalizeDashboardOverviewPayload({ data: { invalid: true } })).toEqual(
      createEmptyDashboardOverviewResponse()
    );
  });
});
