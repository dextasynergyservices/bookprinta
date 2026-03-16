import { dashboardOverviewQueryKey, fetchDashboardOverview } from "./useDashboardOverview";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

describe("useDashboardOverview data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchDashboardOverview requests /dashboard/overview with credentials", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        activeBook: null,
        recentOrders: [],
        notifications: {
          unreadCount: 1,
          hasProductionDelayBanner: false,
        },
        profile: {
          isProfileComplete: true,
          preferredLanguage: "en",
        },
        pendingActions: {
          total: 0,
          items: [],
        },
      }),
    } as unknown as Response);

    const result = await fetchDashboardOverview();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/dashboard/overview");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    expect(result.notifications.unreadCount).toBe(1);
  });

  it("delegates non-ok responses to throwApiError and exposes stable query keys", async () => {
    const expectedError = new Error("Unable to load your dashboard overview");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchDashboardOverview()).rejects.toThrow(expectedError);
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
    expect(dashboardOverviewQueryKey).toEqual(["dashboard", "overview"]);
  });

  it("returns a friendly message for network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(fetchDashboardOverview()).rejects.toThrow(
      "Unable to load your dashboard overview right now"
    );
  });
});
