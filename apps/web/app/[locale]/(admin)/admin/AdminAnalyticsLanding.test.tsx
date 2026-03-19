import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminAnalyticsLanding } from "./AdminAnalyticsLanding";

// ─── hook mocks ──────────────────────────────────────────────────────────────

const useAdminAnalyticsKpiStatsQueryMock = jest.fn();
const useAdminAnalyticsChartDatasetsQueryMock = jest.fn();

jest.mock("@/hooks/useAdminAnalytics", () => ({
  normalizeAdminAnalyticsError: (error: unknown) => ({
    title: "Load failed",
    description: error instanceof Error ? error.message : "Error",
    fieldErrors: {},
  }),
  useAdminAnalyticsKpiStatsQuery: (...args: unknown[]) =>
    useAdminAnalyticsKpiStatsQueryMock(...args),
  useAdminAnalyticsChartDatasetsQuery: (...args: unknown[]) =>
    useAdminAnalyticsChartDatasetsQueryMock(...args),
}));

// ─── i18n ─────────────────────────────────────────────────────────────────────

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values && typeof values === "object") {
      return `${key}:${JSON.stringify(values)}`;
    }
    return key;
  },
}));

// ─── framer-motion ────────────────────────────────────────────────────────────

jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
  useReducedMotion: () => true, // disables count-up animation → settles immediately
}));

// ─── recharts ─────────────────────────────────────────────────────────────────

jest.mock("recharts", () => {
  const PassThrough = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-mock">{children}</div>
  );
  const NullComponent = () => null;

  return {
    ResponsiveContainer: PassThrough,
    AreaChart: PassThrough,
    PieChart: PassThrough,
    BarChart: PassThrough,
    Area: NullComponent,
    Bar: NullComponent,
    Pie: NullComponent,
    Cell: NullComponent,
    CartesianGrid: NullComponent,
    XAxis: NullComponent,
    YAxis: NullComponent,
    Tooltip: NullComponent,
    Legend: NullComponent,
    defs: NullComponent,
    linearGradient: NullComponent,
    stop: NullComponent,
  };
});

// ─── next/link ────────────────────────────────────────────────────────────────

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ─── test data factories ───────────────────────────────────────────────────────

const defaultStats = {
  totalOrders: { value: 142, deltaPercent: 12.5 },
  totalRevenueNgn: { value: 5_250_000, deltaPercent: -3.2 },
  activeBooksInProduction: { value: 8, deltaPercent: 0 },
  pendingBankTransfers: { value: 3, deltaPercent: null },
  slaAtRiskCount: 1,
  range: {
    key: "30d",
    from: new Date(0).toISOString(),
    to: new Date(0).toISOString(),
    previousFrom: new Date(0).toISOString(),
    previousTo: new Date(0).toISOString(),
  },
  lastUpdatedAt: new Date("2026-03-19T10:00:00.000Z").toISOString(),
};

const defaultCharts = {
  revenueAndOrdersTrend: [
    { at: "2026-02-17", orders: 5, revenueNgn: 180_000, pendingTransfers: 0 },
    { at: "2026-03-19", orders: 12, revenueNgn: 432_000, pendingTransfers: 1 },
  ],
  paymentMethodDistribution: [
    { label: "Paystack", value: 80 },
    { label: "Bank Transfer", value: 62 },
  ],
  orderStatusDistribution: [
    { label: "FORMATTING", value: 4 },
    { label: "PRINTING", value: 2 },
  ],
  bankTransferSlaTrend: [{ at: "2026-03-18", under15m: 3, between15mAnd30m: 1, over30m: 0 }],
  range: {
    key: "30d",
    from: new Date(0).toISOString(),
    to: new Date(0).toISOString(),
    previousFrom: new Date(0).toISOString(),
    previousTo: new Date(0).toISOString(),
  },
  refreshedAt: new Date("2026-03-19T10:00:00.000Z").toISOString(),
};

function createStatsQuery(
  overrides: Partial<{
    data: typeof defaultStats;
    isLoading: boolean;
    isError: boolean;
    isEmpty: boolean;
  }> = {}
) {
  const isLoading = overrides.isLoading ?? false;
  const isError = overrides.isError ?? false;
  const isEmpty = overrides.isEmpty ?? false;
  const data = overrides.data ?? defaultStats;

  return {
    data,
    widget: { key: "kpi", data, isLoading, isRefreshing: false, isError, isEmpty, error: null },
    isLoading,
    isError,
    isPending: false,
    isFetching: false,
    isInitialLoading: isLoading,
    error: isError ? new Error("KPI load failed") : null,
    refetch: jest.fn(),
  };
}

function createChartsQuery(
  overrides: Partial<{
    data: typeof defaultCharts;
    allLoading: boolean;
    allError: boolean;
    allEmpty: boolean;
  }> = {}
) {
  const isLoading = overrides.allLoading ?? false;
  const isError = overrides.allError ?? false;
  const isEmpty = overrides.allEmpty ?? false;
  const data = overrides.data ?? defaultCharts;

  const mkWidget = (key: string) => ({
    key,
    isLoading,
    isRefreshing: false,
    isError,
    isEmpty,
    error: isError ? { title: "Failed", description: "Charts load failed", fieldErrors: {} } : null,
  });

  return {
    data,
    widgets: {
      revenueAndOrdersTrend: mkWidget("revenue-orders"),
      paymentMethodDistribution: mkWidget("payment-method"),
      orderStatusDistribution: mkWidget("order-status"),
      bankTransferSlaTrend: mkWidget("bank-transfer-sla"),
    },
    isLoading,
    isError,
    isPending: false,
    isFetching: false,
    error: isError ? new Error("Charts load failed") : null,
    refetch: jest.fn(),
  };
}

function setup(
  statsOverrides: Parameters<typeof createStatsQuery>[0] = {},
  chartsOverrides: Parameters<typeof createChartsQuery>[0] = {}
) {
  useAdminAnalyticsKpiStatsQueryMock.mockReturnValue(createStatsQuery(statsOverrides));
  useAdminAnalyticsChartDatasetsQueryMock.mockReturnValue(createChartsQuery(chartsOverrides));

  const user = userEvent.setup();
  const utils = render(<AdminAnalyticsLanding />);
  return { user, ...utils };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("AdminAnalyticsLanding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── range selector ──────────────────────────────────────────────────────────

  it("renders range buttons with correct aria-pressed state", () => {
    setup();

    const group = screen.getByRole("group", { name: "Analytics time range selector" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(5); // 7d, 30d, 90d, 12m, custom

    const thirtyDay = within(group).getByRole("button", { name: /analytics_range_30d/ });
    expect(thirtyDay).toHaveAttribute("aria-pressed", "true");

    const sevenDay = within(group).getByRole("button", { name: /analytics_range_7d/ });
    expect(sevenDay).toHaveAttribute("aria-pressed", "false");
  });

  it("updates aria-pressed when a range button is clicked", async () => {
    const { user } = setup();

    const group = screen.getByRole("group", { name: "Analytics time range selector" });
    const sevenDayBtn = within(group).getByRole("button", { name: /analytics_range_7d/ });

    await user.click(sevenDayBtn);

    expect(sevenDayBtn).toHaveAttribute("aria-pressed", "true");
    const thirtyDayBtn = within(group).getByRole("button", { name: /analytics_range_30d/ });
    expect(thirtyDayBtn).toHaveAttribute("aria-pressed", "false");
  });

  // ── custom date range ───────────────────────────────────────────────────────

  it("hides custom date inputs for non-custom ranges", () => {
    setup();

    expect(screen.queryByLabelText(/analytics_custom_from/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/analytics_custom_to/)).not.toBeInTheDocument();
  });

  it("shows custom date inputs when custom range is selected", async () => {
    const { user } = setup();

    const group = screen.getByRole("group", { name: "Analytics time range selector" });
    const customBtn = within(group).getByRole("button", { name: /analytics_range_custom/ });
    await user.click(customBtn);

    expect(screen.getByLabelText(/analytics_custom_from/)).toBeInTheDocument();
    expect(screen.getByLabelText(/analytics_custom_to/)).toBeInTheDocument();
  });

  it("shows incomplete-range hint when only one custom date is set", async () => {
    const { user } = setup();

    const group = screen.getByRole("group", { name: "Analytics time range selector" });
    const customBtn = within(group).getByRole("button", { name: /analytics_range_custom/ });
    await user.click(customBtn);

    // Fill "from" but leave "to" empty → hint should appear
    const fromInput = screen.getByLabelText(/analytics_custom_from/);
    await user.type(fromInput, "2026-01-01");

    expect(screen.getByText(/analytics_custom_range_incomplete/)).toBeInTheDocument();
  });

  it("hides incomplete-range hint when both custom dates are filled", async () => {
    const { user } = setup();

    const group = screen.getByRole("group", { name: "Analytics time range selector" });
    const customBtn = within(group).getByRole("button", { name: /analytics_range_custom/ });
    await user.click(customBtn);

    await user.type(screen.getByLabelText(/analytics_custom_from/), "2026-01-01");
    await user.type(screen.getByLabelText(/analytics_custom_to/), "2026-01-31");

    expect(screen.queryByText(/analytics_custom_range_incomplete/)).not.toBeInTheDocument();
  });

  // ── KPI cards ───────────────────────────────────────────────────────────────

  it("renders KPI sr-only spans with the live data values", () => {
    setup();

    // There should be 4 sr-only spans with aria-live
    const liveRegions = document.querySelectorAll("[aria-live='polite'][aria-atomic='true']");

    expect(liveRegions.length).toBe(4);

    // Verify one of the live regions contains a formatted value
    const combined = Array.from(liveRegions)
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(combined).toContain("analytics_kpi_total_orders");
  });

  it("renders 'loading' placeholder in KPI when stats are loading", () => {
    setup({ isLoading: true });

    // The visible (aria-hidden) KPI paragraph should show "--"
    const hiddenParagraphs = document.querySelectorAll("[aria-hidden='true'].font-display");
    for (const el of hiddenParagraphs) {
      expect(el.textContent).toBe("--");
    }
  });

  // ── chart containers accessibility ─────────────────────────────────────────

  it("renders chart containers with role=img and aria-label", () => {
    setup();

    const charts = screen.getAllByRole("img");
    expect(charts.length).toBeGreaterThanOrEqual(4);

    const labels = charts.map((el) => el.getAttribute("aria-label"));
    expect(labels).toContain("analytics_chart_revenue_orders");
    expect(labels).toContain("analytics_chart_payment_methods");
    expect(labels).toContain("analytics_chart_order_status");
    expect(labels).toContain("analytics_chart_transfer_sla");
  });

  // ── loading / error / empty states ─────────────────────────────────────────

  it("renders skeleton placeholders when charts are loading", () => {
    setup({}, { allLoading: true });

    // ChartCardSkeleton only renders its inner div in the Skeleton mock;
    // just check that no recharts mocks are in the DOM
    const rechartsMocks = document.querySelectorAll("[data-testid='recharts-mock']");
    expect(rechartsMocks.length).toBe(0);
  });

  it("renders error state for charts when query fails", () => {
    setup({}, { allError: true });

    // WidgetError renders an AlertTriangle + message
    // In this test, normalizeAdminAnalyticsError mock returns "Charts load failed"
    const errorTexts = screen.getAllByText("Charts load failed");
    expect(errorTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty state for charts when data has no values", () => {
    setup({}, { allEmpty: true });

    // WidgetEmpty renders an empty state message for each chart
    const emptyRevOrders = screen.getByText("analytics_chart_empty_revenue_orders");
    expect(emptyRevOrders).toBeInTheDocument();
  });

  // ── DeltaBadge ──────────────────────────────────────────────────────────────

  it("renders positive delta with accessible aria-label", () => {
    // totalOrders has deltaPercent: 12.5 in default stats
    setup();

    const positiveBadge = screen.getByLabelText(/^Up 12\.5% from prior period$/);
    expect(positiveBadge).toBeInTheDocument();
  });

  it("renders negative delta with accessible aria-label", () => {
    // totalRevenueNgn has deltaPercent: -3.2 in default stats
    setup();

    const negativeBadge = screen.getByLabelText(/^Down 3\.2% from prior period$/);
    expect(negativeBadge).toBeInTheDocument();
  });

  it("renders null delta as 'No trend data available'", () => {
    // pendingBankTransfers has deltaPercent: null
    setup();

    const nullBadge = screen.getByLabelText("No trend data available");
    expect(nullBadge).toBeInTheDocument();
  });
});
