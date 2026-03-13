import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminBooksView } from "./AdminBooksView";

const useAdminBooksMock = jest.fn();
const useAdminBooksFiltersMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  books: "Books",
  books_workspace_description:
    "Track manuscripts, filter by status, and work through the production queue.",
  books_filters_status_label: "Status",
  books_filters_clear: "Clear Filters",
  books_filters_all_statuses: "All statuses",
  books_filters_active: "{count} filters active",
  books_filters_idle: "No active filters",
  books_summary_label: "Snapshot",
  books_summary_total: "{shown} of {total} books",
  books_loading_more: "Loading more books",
  books_table_title: "Book Title",
  books_table_author: "Author",
  books_table_status: "Status",
  books_table_order_ref: "Order Ref",
  books_table_upload_date: "Upload Date",
  books_table_actions: "Actions",
  books_action_view: "View Book",
  books_title_untitled: "Untitled book",
  books_author_unknown: "Unknown author",
  books_order_unavailable: "Order unavailable",
  books_upload_date_unavailable: "Upload date unavailable",
  books_pagination_aria: "Books pagination",
  books_pagination_page: "Page {page}",
  books_pagination_page_of: "Page {page} of {totalPages}",
  books_pagination_previous: "Previous",
  books_pagination_next: "Next",
  books_empty_title: "No books yet",
  books_empty_description: "Books will appear here when they arrive.",
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

jest.mock("@/hooks/useAdminBooks", () => ({
  useAdminBooks: (input: unknown) => useAdminBooksMock(input),
}));

jest.mock("@/hooks/use-admin-books-filters", () => {
  const actual = jest.requireActual("@/hooks/use-admin-books-filters");

  return {
    ...actual,
    useAdminBooksFilters: () => useAdminBooksFiltersMock(),
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
    cursor: "",
    sortBy: "uploadedAt" as const,
    sortDirection: "desc" as const,
    currentPage: 1,
    activeFilterCount: 0,
    hasActiveFilters: false,
    trail: [] as Array<string | null>,
    setStatus: jest.fn(),
    clearFilters: jest.fn(),
    setSort: jest.fn(),
    goToNextCursor: jest.fn(),
    goToPreviousCursor: jest.fn(),
  };
}

function createLoadedBooksState() {
  const data = {
    items: [
      {
        id: "book_1",
        title: "The Lagos Chronicle",
        author: {
          id: "user_1",
          fullName: "Ada Okafor",
          email: "ada@example.com",
          preferredLanguage: "en",
        },
        order: {
          id: "ord_1",
          orderNumber: "BP-2026-0001",
          status: "FORMATTING",
          detailUrl: "/admin/orders/ord_1",
        },
        status: "FORMATTING",
        productionStatus: null,
        displayStatus: "FORMATTING",
        statusSource: "manuscript",
        uploadedAt: "2026-03-10T09:30:00.000Z",
        createdAt: "2026-03-10T09:30:00.000Z",
        detailUrl: "/admin/books/book_1",
      },
    ],
    nextCursor: "cursor_2",
    hasMore: true,
    totalItems: 2,
    limit: 20,
    sortBy: "uploadedAt" as const,
    sortDirection: "desc" as const,
    sortableFields: ["title", "authorName", "displayStatus", "orderNumber", "uploadedAt"],
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

describe("AdminBooksView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAdminBooksFiltersMock.mockReturnValue(createBaseFilters());
    useAdminBooksMock.mockReturnValue(createLoadedBooksState());
  });

  it("renders skeleton loaders while the admin books query is pending", () => {
    useAdminBooksMock.mockReturnValue({
      data: {
        items: [],
        nextCursor: null,
        hasMore: false,
        totalItems: 0,
        limit: 20,
        sortBy: "uploadedAt",
        sortDirection: "desc",
        sortableFields: ["title", "authorName", "displayStatus", "orderNumber", "uploadedAt"],
      },
      items: [],
      isError: false,
      error: null,
      refetch: jest.fn(),
      isFetching: true,
      isInitialLoading: true,
      isPageTransitioning: false,
    });

    const { container } = render(<AdminBooksView />);

    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("wires the status filter, sortable headers, and cursor pagination to the books filters hook", async () => {
    const user = userEvent.setup();
    const filters = createBaseFilters();
    useAdminBooksFiltersMock.mockReturnValue(filters);

    render(<AdminBooksView />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "FORMATTING");
    expect(filters.setStatus).toHaveBeenCalledWith("FORMATTING");

    await user.click(screen.getByRole("button", { name: "Upload Date" }));
    expect(filters.setSort).toHaveBeenCalledWith("uploadedAt", "asc");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(filters.goToNextCursor).toHaveBeenCalledWith("cursor_2");
  });

  it("renders the mobile-first book cards cleanly at 375px", () => {
    setViewportWidth(375);

    render(<AdminBooksView />);

    expect(screen.getAllByText("The Lagos Chronicle").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "View Book" })[0]).toHaveAttribute(
      "href",
      "/admin/books/book_1"
    );
    expect(screen.getByRole("navigation", { name: "Books pagination" })).toBeInTheDocument();
  });
});
