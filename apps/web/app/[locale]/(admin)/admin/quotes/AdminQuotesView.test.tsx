import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminQuotesView } from "./AdminQuotesView";

const useAdminQuotesFiltersMock = jest.fn();
const useAdminQuotesMock = jest.fn();
const useAdminRejectQuoteMutationMock = jest.fn();
const useAdminArchiveQuoteMutationMock = jest.fn();
const useAdminRevokeQuotePaymentLinkMutationMock = jest.fn();
const useAdminDeleteQuoteMutationMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  quotes: "Quotes",
  quotes_workspace_description: "Manage custom quote submissions",
  quotes_filters_active: "{count} filters active",
  quotes_filters_idle: "No active filters",
  quotes_filters_clear: "Clear",
  quotes_filters_all_statuses: "All statuses",
  quotes_filters_search_label: "Search",
  quotes_filters_search_placeholder: "Search by title or email",
  quotes_filters_status_label: "Status",
  quotes_filters_sort_label: "Sort by",
  quotes_filters_sort_direction_label: "Direction",
  quotes_sort_createdAt: "Created",
  quotes_sort_updatedAt: "Updated",
  quotes_sort_fullName: "Customer",
  quotes_sort_email: "Email",
  quotes_sort_workingTitle: "Title",
  quotes_sort_bookPrintSize: "Format",
  quotes_sort_quantity: "Quantity",
  quotes_sort_status: "Status",
  quotes_sort_finalPrice: "Final price",
  quotes_sort_direction_desc: "Newest first",
  quotes_sort_direction_asc: "Oldest first",
  quotes_summary_label: "Summary",
  quotes_summary_total: "Showing {shown} quotes from {total} total.",
  quotes_loading_more: "Loading updated quotes",
  quotes_table_customer: "Customer",
  quotes_table_email: "Email",
  quotes_table_title: "Title",
  quotes_table_format: "Format",
  quotes_table_quantity: "Quantity",
  quotes_table_estimate: "Estimate",
  quotes_table_status: "Status",
  quotes_table_link_status: "Link",
  quotes_table_created: "Created",
  quotes_table_actions: "Actions",
  quotes_action_view: "View Quote",
  quotes_date_unavailable: "Date unavailable",
  quotes_pagination_label: "Pagination",
  quotes_pagination_page: "Page {page}",
  quotes_pagination_previous: "Previous",
  quotes_pagination_next: "Next",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations: (_namespace?: string) => (key: string, values?: Record<string, unknown>) =>
    interpolate(translations[key] ?? key, values),
  useLocale: () => "en",
}));

jest.mock("@/components/dashboard/dashboard-content-frame", () => ({
  DashboardResponsiveDataRegion: ({
    mobileCards,
    desktopTable,
  }: {
    mobileCards: ReactNode;
    desktopTable: ReactNode;
  }) => (
    <div>
      <div data-testid="mobile-region">{mobileCards}</div>
      <div data-testid="desktop-region">{desktopTable}</div>
    </div>
  ),
  DashboardTableViewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

jest.mock("@/hooks/use-admin-quotes-filters", () => ({
  ADMIN_QUOTES_STATUS_OPTIONS: ["PENDING", "PAYMENT_LINK_SENT", "PAID", "REJECTED"],
  DEFAULT_ADMIN_QUOTES_SORT_BY: "createdAt",
  DEFAULT_ADMIN_QUOTES_SORT_DIRECTION: "desc",
  humanizeAdminQuoteStatus: (value: string) =>
    value
      .toLowerCase()
      .split("_")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" "),
  useAdminQuotesFilters: () => useAdminQuotesFiltersMock(),
}));

jest.mock("@/hooks/useAdminQuotes", () => ({
  useAdminQuotes: (input: unknown) => useAdminQuotesMock(input),
}));

jest.mock("@/hooks/useAdminQuoteActions", () => ({
  useAdminRejectQuoteMutation: () => useAdminRejectQuoteMutationMock(),
  useAdminArchiveQuoteMutation: () => useAdminArchiveQuoteMutationMock(),
  useAdminRevokeQuotePaymentLinkMutation: () => useAdminRevokeQuotePaymentLinkMutationMock(),
  useAdminDeleteQuoteMutation: () => useAdminDeleteQuoteMutationMock(),
}));

function createMutationShape() {
  return {
    mutateAsync: jest.fn(),
    isPending: false,
  };
}

function createFilters() {
  return {
    status: "",
    q: "",
    cursor: "",
    sortBy: "createdAt",
    sortDirection: "desc",
    currentPage: 1,
    activeFilterCount: 0,
    hasActiveFilters: false,
    setStatus: jest.fn(),
    setSearch: jest.fn(),
    clearFilters: jest.fn(),
    setSort: jest.fn(),
    goToNextCursor: jest.fn(),
    goToPreviousCursor: jest.fn(),
    trail: [],
  };
}

function createQuotesState(overrides?: Record<string, unknown>) {
  return {
    data: {
      items: [
        {
          id: "cmquote-list-1",
          fullName: "Ada Writer",
          email: "ada@example.com",
          workingTitle: "River of Ink",
          bookPrintSize: "A5",
          quantity: 120,
          estimate: {
            mode: "RANGE",
            estimatedPriceLow: 120000,
            estimatedPriceHigh: 140000,
            label: "NGN 120,000 - NGN 140,000",
          },
          status: "PENDING",
          paymentLinkStatus: "NOT_SENT",
          actions: {
            canRevokePaymentLink: false,
            canReject: true,
            canArchive: true,
            canDelete: true,
          },
          createdAt: "2026-03-01T10:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
      totalItems: 1,
      limit: 20,
      sortBy: "createdAt",
      sortDirection: "desc",
      sortableFields: ["createdAt"],
    },
    items: [
      {
        id: "cmquote-list-1",
        fullName: "Ada Writer",
        email: "ada@example.com",
        workingTitle: "River of Ink",
        bookPrintSize: "A5",
        quantity: 120,
        estimate: {
          mode: "RANGE",
          estimatedPriceLow: 120000,
          estimatedPriceHigh: 140000,
          label: "NGN 120,000 - NGN 140,000",
        },
        status: "PENDING",
        paymentLinkStatus: "NOT_SENT",
        actions: {
          canRevokePaymentLink: false,
          canReject: true,
          canArchive: true,
          canDelete: true,
        },
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    ],
    isError: false,
    error: null,
    refetch: jest.fn(),
    isFetching: false,
    isInitialLoading: false,
    isPageTransitioning: false,
    ...overrides,
  };
}

describe("AdminQuotesView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAdminQuotesFiltersMock.mockReturnValue(createFilters());
    useAdminQuotesMock.mockReturnValue(createQuotesState());
    useAdminRejectQuoteMutationMock.mockReturnValue(createMutationShape());
    useAdminArchiveQuoteMutationMock.mockReturnValue(createMutationShape());
    useAdminRevokeQuotePaymentLinkMutationMock.mockReturnValue(createMutationShape());
    useAdminDeleteQuoteMutationMock.mockReturnValue(createMutationShape());
  });

  it("updates status filter and debounced search query", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const filters = createFilters();
    useAdminQuotesFiltersMock.mockReturnValue(filters);

    render(<AdminQuotesView />);

    await user.click(screen.getByRole("button", { name: "Pending" }));
    expect(filters.setStatus).toHaveBeenCalledWith("PENDING");

    const searchInput = screen.getByLabelText("Search");
    await user.type(searchInput, "Ada quote");

    act(() => {
      jest.advanceTimersByTime(260);
    });

    expect(filters.setSearch).toHaveBeenCalledWith("Ada quote");
    jest.useRealTimers();
  });

  it("renders stable loading skeletons instead of blank content while loading", () => {
    useAdminQuotesMock.mockReturnValue(
      createQuotesState({
        items: [],
        data: {
          items: [],
          nextCursor: null,
          hasMore: false,
          totalItems: 0,
          limit: 20,
          sortBy: "createdAt",
          sortDirection: "desc",
          sortableFields: ["createdAt"],
        },
        isInitialLoading: true,
      })
    );

    const { container } = render(<AdminQuotesView />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(5);
    expect(screen.queryByText("quotes_empty_title")).not.toBeInTheDocument();
  });
});
