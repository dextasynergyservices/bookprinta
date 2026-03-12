import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminOrdersView } from "./AdminOrdersView";

const useAdminOrdersMock = jest.fn();
const usePackagesMock = jest.fn();
const useAdminOrdersFiltersMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  orders: "Orders",
  orders_workspace_description:
    "Review orders, apply server-side filters, and take operational actions.",
  orders_filters_active: "{count} filters active",
  orders_filters_idle: "No filters active",
  orders_filters_clear: "Clear Filters",
  orders_filters_search_label: "Search",
  orders_filters_search_placeholder: "Search orders",
  orders_filters_status_label: "Status",
  orders_filters_all_statuses: "All statuses",
  orders_filters_package_label: "Package",
  orders_filters_all_packages: "All packages",
  orders_filters_packages_loading: "Loading packages",
  orders_filters_date_label: "Date Range",
  orders_filters_date_placeholder: "Select range",
  orders_filters_date_from: "From",
  orders_filters_date_to: "To",
  orders_filters_date_clear: "Clear Date",
  orders_summary_label: "Snapshot",
  orders_summary_total: "{shown} of {total} orders",
  orders_loading_more: "Loading more orders",
  orders_table_order_ref: "Order Ref",
  orders_table_customer: "Customer",
  orders_table_email: "Email",
  orders_table_package: "Package",
  orders_table_status: "Status",
  orders_table_date: "Date",
  orders_table_total: "Total",
  orders_table_actions: "Actions",
  orders_action_view: "View Order",
  orders_date_unavailable: "Date unavailable",
  orders_total_unavailable: "Total unavailable",
  orders_customer_phone_unavailable: "Phone unavailable",
  orders_pagination_aria: "Orders pagination",
  orders_pagination_page: "Page {page}",
  orders_pagination_page_of: "Page {page} of {totalPages}",
  orders_pagination_previous: "Previous",
  orders_pagination_next: "Next",
  orders_empty_title: "No orders yet",
  orders_empty_description: "Orders will appear here when they arrive.",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    interpolate(translations[key] ?? key, values),
  useLocale: () => "en",
}));

jest.mock("@/hooks/usePackages", () => ({
  usePackages: () => usePackagesMock(),
}));

jest.mock("@/hooks/useAdminOrders", () => ({
  useAdminOrders: (input: unknown) => useAdminOrdersMock(input),
}));

jest.mock("@/hooks/use-admin-orders-filters", () => {
  const actual = jest.requireActual("@/hooks/use-admin-orders-filters");

  return {
    ...actual,
    useAdminOrdersFilters: () => useAdminOrdersFiltersMock(),
  };
});

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

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

function createBaseFilters() {
  return {
    status: "",
    packageId: "",
    dateFrom: "",
    dateTo: "",
    q: "",
    cursor: "",
    sortBy: "createdAt" as const,
    sortDirection: "desc" as const,
    currentPage: 1,
    activeFilterCount: 0,
    hasActiveFilters: false,
    trail: [] as Array<string | null>,
    setStatus: jest.fn(),
    setPackageId: jest.fn(),
    setSearch: jest.fn(),
    setDateRange: jest.fn(),
    clearFilters: jest.fn(),
    setSort: jest.fn(),
    goToNextCursor: jest.fn(),
    goToPreviousCursor: jest.fn(),
  };
}

function createLoadedOrdersState() {
  const data = {
    items: [
      {
        id: "ord_1",
        orderNumber: "BP-2026-0001",
        customer: {
          id: "user_1",
          fullName: "Ada Okafor",
          email: "ada@example.com",
          phoneNumber: "+2348012345678",
          preferredLanguage: "en",
        },
        package: {
          id: "pkg_1",
          name: "Signature Memoir",
          slug: "signature-memoir",
        },
        orderStatus: "FORMATTING",
        bookStatus: null,
        displayStatus: "FORMATTING",
        statusSource: "order",
        createdAt: "2026-03-10T09:30:00.000Z",
        totalAmount: 100000,
        currency: "NGN",
        detailUrl: "/admin/orders/ord_1",
      },
    ],
    nextCursor: "cursor_2",
    hasMore: true,
    totalItems: 2,
    limit: 20,
    sortBy: "createdAt" as const,
    sortDirection: "desc" as const,
    sortableFields: [
      "orderNumber",
      "customerName",
      "customerEmail",
      "packageName",
      "displayStatus",
      "createdAt",
      "totalAmount",
    ],
  };

  return {
    data,
    items: data.items,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isFetching: false,
    isInitialLoading: false,
    isPageTransitioning: false,
  };
}

describe("AdminOrdersView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePackagesMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
    useAdminOrdersFiltersMock.mockReturnValue(createBaseFilters());
    useAdminOrdersMock.mockReturnValue(createLoadedOrdersState());
  });

  it("renders skeleton loaders while the admin orders query is pending", () => {
    useAdminOrdersMock.mockReturnValue({
      data: {
        items: [],
        nextCursor: null,
        hasMore: false,
        totalItems: 0,
        limit: 20,
        sortBy: "createdAt",
        sortDirection: "desc",
        sortableFields: [
          "orderNumber",
          "customerName",
          "customerEmail",
          "packageName",
          "displayStatus",
          "createdAt",
          "totalAmount",
        ],
      },
      items: [],
      isError: false,
      error: null,
      refetch: jest.fn(),
      isFetching: true,
      isInitialLoading: true,
      isPageTransitioning: false,
    });

    const { container } = render(<AdminOrdersView />);

    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("wires sortable headers and cursor pagination controls to the admin filters hook", async () => {
    const user = userEvent.setup();
    const filters = createBaseFilters();
    useAdminOrdersFiltersMock.mockReturnValue(filters);

    render(<AdminOrdersView />);

    await user.click(screen.getByRole("button", { name: "Total" }));
    expect(filters.setSort).toHaveBeenCalledWith("totalAmount", "asc");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(filters.goToNextCursor).toHaveBeenCalledWith("cursor_2");
  });

  it("renders the mobile-first order cards cleanly at 375px", () => {
    setViewportWidth(375);

    render(<AdminOrdersView />);

    expect(screen.getAllByText("BP-2026-0001").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "View Order" })[0]).toHaveAttribute(
      "href",
      "/admin/orders/ord_1"
    );
    expect(screen.getByRole("navigation", { name: "Orders pagination" })).toBeInTheDocument();
  });
});
