import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { DashboardOverviewView } from "./dashboard-overview-view";

/* ─── shared mocks ────────────────────────────────────────── */

const useDashboardOverviewPageDataMock = jest.fn();
const useAuthSessionMock = jest.fn();
const useNotificationsListMock = jest.fn();
const useBookFilesMock = jest.fn();
const useBookPreviewMock = jest.fn();

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === "common") {
      if (key === "retry") return "Try Again";
      if (key === "loading") return "Loading...";
    }
    return key;
  },
}));

jest.mock("next/dynamic", () => () => {
  return function DynamicDashboardOverviewDeferredSections(props: Record<string, unknown>) {
    const { DashboardOverviewDeferredSections } = jest.requireActual(
      "./dashboard-overview-deferred-sections"
    );
    return <DashboardOverviewDeferredSections {...props} />;
  };
});

jest.mock("next/image", () => ({
  __esModule: true,
  // biome-ignore lint/performance/noImgElement: test double for next/image
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));

jest.mock("@/hooks/useDashboardOverviewPageData", () => ({
  useDashboardOverviewPageData: () => useDashboardOverviewPageDataMock(),
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useNotificationsList: (...args: unknown[]) => useNotificationsListMock(...args),
}));

jest.mock("@/hooks/useBookResources", () => ({
  useBookFiles: (...args: unknown[]) => useBookFilesMock(...args),
  useBookPreview: (...args: unknown[]) => useBookPreviewMock(...args),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/* ─── helpers ─────────────────────────────────────────────── */

function createBaseOverviewData() {
  return {
    isInitialLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    activeBook: null,
    recentOrders: [],
    notifications: { unreadCount: 0, hasProductionDelayBanner: false },
    profile: { isProfileComplete: true, preferredLanguage: "en" },
    pendingActions: { total: 0, items: [] },
    reviewState: {
      hasAnyEligibleBook: false,
      hasPendingReviews: false,
      pendingBooks: [],
    },
  };
}

function setupDefaultMocks() {
  useAuthSessionMock.mockReturnValue({
    user: { displayName: "Amina Yusuf" },
  });
  useNotificationsListMock.mockReturnValue({
    items: [],
    isInitialLoading: false,
    isError: false,
  });
  useBookFilesMock.mockReturnValue({
    data: { bookId: "cmbook11111111111111111111111", files: [] },
    isPending: false,
    isError: false,
  });
  useBookPreviewMock.mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
  });
}

/* ═══ 1. Loading → Data transitions (no blank screen) ═════ */

describe("loading → data transitions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it("shows loading skeleton first, then replaces with content — never a blank frame", () => {
    useDashboardOverviewPageDataMock.mockReturnValue({
      ...createBaseOverviewData(),
      isInitialLoading: true,
    });

    const { rerender } = render(<DashboardOverviewView />);

    // Phase 1: loading → skeleton visible, no content
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("overview_editorial_title")).not.toBeInTheDocument();

    // Phase 2: data arrives → content appears, skeleton gone
    useDashboardOverviewPageDataMock.mockReturnValue(createBaseOverviewData());
    rerender(<DashboardOverviewView />);

    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.getByText("overview_editorial_title")).toBeInTheDocument();
  });

  it("keeps previous data visible during a background refetch — no blank flash", () => {
    const baseData = createBaseOverviewData();
    useDashboardOverviewPageDataMock.mockReturnValue(baseData);

    const { rerender } = render(<DashboardOverviewView />);

    // Content is rendered
    expect(screen.getByText("overview_editorial_title")).toBeInTheDocument();

    // Simulate background refetch: isFetching = true, but isInitialLoading = false
    useDashboardOverviewPageDataMock.mockReturnValue({
      ...baseData,
      isFetching: true,
      isInitialLoading: false,
    });
    rerender(<DashboardOverviewView />);

    // Content must still be visible — no blank screen
    expect(screen.getByText("overview_editorial_title")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});

/* ═══ 2. Error → Retry → Success ══════════════════════════ */

describe("error → retry → success cycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it("shows error state with retry, then resolves to content on retry success", () => {
    const refetch = jest.fn();
    useDashboardOverviewPageDataMock.mockReturnValue({
      ...createBaseOverviewData(),
      isError: true,
      refetch,
    });

    const { rerender } = render(<DashboardOverviewView />);

    // Phase 1: error state is visible
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    expect(screen.queryByText("overview_editorial_title")).not.toBeInTheDocument();

    // User clicks retry
    screen.getByRole("button", { name: "Try Again" }).click();
    expect(refetch).toHaveBeenCalledTimes(1);

    // Phase 2: data resolves
    useDashboardOverviewPageDataMock.mockReturnValue(createBaseOverviewData());
    rerender(<DashboardOverviewView />);

    expect(screen.queryByRole("button", { name: "Try Again" })).not.toBeInTheDocument();
    expect(screen.getByText("overview_editorial_title")).toBeInTheDocument();
  });

  it("does not flash content between loading → error — shows one or the other", () => {
    // Start loading
    useDashboardOverviewPageDataMock.mockReturnValue({
      ...createBaseOverviewData(),
      isInitialLoading: true,
    });

    const { rerender } = render(<DashboardOverviewView />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Transition to error (no isInitialLoading anymore)
    useDashboardOverviewPageDataMock.mockReturnValue({
      ...createBaseOverviewData(),
      isError: true,
      refetch: jest.fn(),
    });
    rerender(<DashboardOverviewView />);

    // No blank: error state visible
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.queryByText("overview_editorial_title")).not.toBeInTheDocument();
  });
});

/* ═══ 3. Polling configuration ════════════════════════════ */

describe("polling configuration", () => {
  it("exposes correct polling intervals and stale times", () => {
    const {
      DASHBOARD_POLL_INTERVAL_MS,
      DASHBOARD_STATUS_STALE_TIME_MS,
      DASHBOARD_HISTORY_STALE_TIME_MS,
      DASHBOARD_LIVE_STALE_TIME_MS,
      DASHBOARD_QUERY_GC_TIME_MS,
      DASHBOARD_QUERY_RETRY_COUNT,
      dashboardStatusPollingQueryOptions,
      dashboardRealtimeQueryOptions,
      dashboardHistoryQueryOptions,
      dashboardLiveQueryOptions,
      createDashboardConditionalRealtimeQueryOptions,
    } = jest.requireActual("@/lib/dashboard/query-defaults");

    // Core timing constants
    expect(DASHBOARD_POLL_INTERVAL_MS).toBe(30_000);
    expect(DASHBOARD_STATUS_STALE_TIME_MS).toBe(15_000);
    expect(DASHBOARD_HISTORY_STALE_TIME_MS).toBe(60_000);
    expect(DASHBOARD_LIVE_STALE_TIME_MS).toBe(0);
    expect(DASHBOARD_QUERY_GC_TIME_MS).toBe(600_000);
    expect(DASHBOARD_QUERY_RETRY_COUNT).toBe(1);

    // Status polling: 15s stale, 30s refetch interval, focus refetch
    expect(dashboardStatusPollingQueryOptions.staleTime).toBe(15_000);
    expect(dashboardStatusPollingQueryOptions.refetchInterval).toBe(30_000);
    expect(dashboardStatusPollingQueryOptions.refetchOnWindowFocus).toBe(true);

    // Realtime: 0s stale, 30s poll, background polling
    expect(dashboardRealtimeQueryOptions.staleTime).toBe(0);
    expect(dashboardRealtimeQueryOptions.refetchInterval).toBe(30_000);
    expect(dashboardRealtimeQueryOptions.refetchIntervalInBackground).toBe(true);

    // History: 60s stale, no polling
    expect(dashboardHistoryQueryOptions.staleTime).toBe(60_000);
    expect(dashboardHistoryQueryOptions).not.toHaveProperty("refetchInterval");

    // Live: 0s stale, refetch on focus + mount
    expect(dashboardLiveQueryOptions.staleTime).toBe(0);
    expect(dashboardLiveQueryOptions.refetchOnWindowFocus).toBe(true);
    expect(dashboardLiveQueryOptions.refetchOnMount).toBe("always");

    // Conditional realtime: active = polling, inactive = no polling
    const active = createDashboardConditionalRealtimeQueryOptions(true);
    expect(active.refetchInterval).toBe(30_000);
    expect(active.refetchIntervalInBackground).toBe(true);

    const inactive = createDashboardConditionalRealtimeQueryOptions(false);
    expect(inactive.refetchInterval).toBe(false);
    expect(inactive.refetchIntervalInBackground).toBe(false);
    expect(inactive.refetchOnMount).toBe(false);
  });
});

/* ═══ 4. Fetch function contracts — network & API errors ══ */

describe("fetch function error handling", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchDashboardOverview wraps network errors with user-friendly message", async () => {
    const { fetchDashboardOverview } = jest.requireActual("@/hooks/useDashboardOverview");

    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(fetchDashboardOverview()).rejects.toThrow(
      "Unable to load your dashboard overview right now"
    );
  });

  it("fetchOrdersPage wraps network errors with user-friendly message", async () => {
    const { fetchOrdersPage } = jest.requireActual("@/hooks/useOrders");

    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(fetchOrdersPage({ page: 1, pageSize: 10 })).rejects.toThrow(
      "Unable to load your orders right now"
    );
  });

  it("fetchNotificationsPage wraps network errors with user-friendly message", async () => {
    const { fetchNotificationsPage } = jest.requireActual("@/hooks/use-dashboard-shell-data");

    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(fetchNotificationsPage({ page: 1, pageSize: 20 })).rejects.toThrow(
      "Unable to load notifications right now"
    );
  });
});

/* ═══ 5. Empty state — no blank screen for first-time user ═ */

describe("empty state — first time user", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders meaningful empty states rather than blank sections", () => {
    useDashboardOverviewPageDataMock.mockReturnValue({
      ...createBaseOverviewData(),
      activeBook: null,
      recentOrders: [],
      pendingActions: { total: 0, items: [] },
    });

    render(<DashboardOverviewView />);

    // Must show empty states, not blank areas
    expect(screen.getByText("overview_editorial_title")).toBeInTheDocument();
    expect(screen.getByText("overview_next_action_idle_title")).toBeInTheDocument();
    expect(screen.getByText("overview_active_book_empty_title")).toBeInTheDocument();
    expect(screen.getByText("orders_empty_title")).toBeInTheDocument();

    // And a link to start publishing
    expect(screen.getByRole("link", { name: /overview_next_action_idle_cta/ })).toHaveAttribute(
      "href",
      "/pricing"
    );
  });
});
