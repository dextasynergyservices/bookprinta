import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminUsersView } from "./AdminUsersView";

const useAdminUsersMock = jest.fn();
const useAdminUsersFiltersMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  users: "Users",
  role_user: "USER",
  role_admin: "ADMIN",
  role_editor: "EDITOR",
  role_manager: "MANAGER",
  role_super_admin: "SUPER ADMIN",
  users_workspace_description:
    "Review every customer account, search the directory, and move into individual user histories.",
  users_filters_search_label: "Search",
  users_filters_search_placeholder: "Search by name or email",
  users_filters_role_label: "Role",
  users_filters_verified_label: "Verification",
  users_filters_all_roles: "All roles",
  users_filters_all_verification: "All verification states",
  users_filters_verified_true: "Verified only",
  users_filters_verified_false: "Unverified only",
  users_filters_clear: "Clear Filters",
  users_filters_active: "{count} filters active",
  users_filters_idle: "No filters active",
  users_summary_label: "User Directory",
  users_summary_total: "Showing {shown} users from {total} total.",
  users_loading_more: "Loading updated users",
  users_table_name: "Name",
  users_table_email: "Email",
  users_table_role: "Role",
  users_table_verified: "Verified",
  users_table_joined: "Joined",
  users_table_actions: "Actions",
  users_action_view: "Manage User",
  users_status_verified: "Verified",
  users_status_unverified: "Unverified",
  users_status_active: "Active",
  users_status_inactive: "Inactive",
  users_joined_unavailable: "Join date unavailable",
  users_pagination_aria: "Users pagination",
  users_pagination_page: "Page {page}",
  users_pagination_page_of: "Page {page} of {totalPages}",
  users_pagination_previous: "Previous",
  users_pagination_next: "Next",
  users_empty_title: "No users match these filters",
  users_empty_description:
    "New customer accounts will appear here after checkout and registration.",
  users_empty_filtered_description:
    "Try broadening the search or clearing filters to surface more accounts.",
  users_error_title: "Unable to load admin users",
  users_error_description: "We couldn't load the user directory right now. Please try again.",
  retry: "Retry",
  loading: "Loading",
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

jest.mock("@/hooks/useAdminUsers", () => ({
  useAdminUsers: (input: unknown) => useAdminUsersMock(input),
}));

jest.mock("@/hooks/use-admin-users-filters", () => {
  const actual = jest.requireActual("@/hooks/use-admin-users-filters");

  return {
    ...actual,
    useAdminUsersFilters: () => useAdminUsersFiltersMock(),
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
    role: "",
    isVerified: "",
    q: "",
    cursor: "",
    sortBy: "createdAt" as const,
    sortDirection: "desc" as const,
    currentPage: 1,
    activeFilterCount: 0,
    hasActiveFilters: false,
    trail: [] as Array<string | null>,
    setRole: jest.fn(),
    setVerification: jest.fn(),
    setSearch: jest.fn(),
    clearFilters: jest.fn(),
    setSort: jest.fn(),
    goToNextCursor: jest.fn(),
    goToPreviousCursor: jest.fn(),
  };
}

function createLoadedUsersState() {
  const data = {
    items: [
      {
        id: "cm1111111111111111111111111",
        fullName: "Ada Okafor",
        email: "ada@example.com",
        role: "EDITOR" as const,
        isVerified: true,
        isActive: false,
        createdAt: "2026-03-10T09:30:00.000Z",
        detailUrl: "/admin/users/cm1111111111111111111111111",
      },
    ],
    nextCursor: "cm2222222222222222222222222",
    hasMore: true,
    totalItems: 2,
    limit: 20,
    sortBy: "createdAt" as const,
    sortDirection: "desc" as const,
    sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
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

describe("AdminUsersView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAdminUsersFiltersMock.mockReturnValue(createBaseFilters());
    useAdminUsersMock.mockReturnValue(createLoadedUsersState());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders skeleton loaders while the admin users query is pending", () => {
    useAdminUsersMock.mockReturnValue({
      data: {
        items: [],
        nextCursor: null,
        hasMore: false,
        totalItems: 0,
        limit: 20,
        sortBy: "createdAt",
        sortDirection: "desc",
        sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
      },
      items: [],
      isError: false,
      error: null,
      refetch: jest.fn(),
      isFetching: true,
      isInitialLoading: true,
      isPageTransitioning: false,
    });

    const { container } = render(<AdminUsersView />);

    expect(screen.getByRole("textbox", { name: "Search" })).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("wires search, filters, sorting, and cursor pagination to the users filters hook", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const filters = createBaseFilters();
    useAdminUsersFiltersMock.mockReturnValue(filters);

    render(<AdminUsersView />);

    await user.type(screen.getByRole("textbox", { name: "Search" }), "Ada");
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(filters.setSearch).toHaveBeenCalledWith("Ada");

    await user.selectOptions(screen.getByRole("combobox", { name: "Role" }), "EDITOR");
    expect(filters.setRole).toHaveBeenCalledWith("EDITOR");

    await user.selectOptions(screen.getByRole("combobox", { name: "Verification" }), "false");
    expect(filters.setVerification).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Joined" }));
    expect(filters.setSort).toHaveBeenCalledWith("createdAt", "asc");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(filters.goToNextCursor).toHaveBeenCalledWith("cm2222222222222222222222222");
  });

  it("renders the mobile-first user cards cleanly at 375px", () => {
    setViewportWidth(375);

    render(<AdminUsersView />);

    expect(screen.getAllByText("Ada Okafor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Manage User/ })[0]).toHaveAttribute(
      "href",
      "/admin/users/cm1111111111111111111111111"
    );
    expect(screen.getByRole("navigation", { name: "Users pagination" })).toBeInTheDocument();
  });

  it("exposes aria-sort on the sortable table headers", () => {
    render(<AdminUsersView />);

    expect(screen.getByRole("columnheader", { name: "Joined" })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "none");
  });

  it("only exposes sort buttons for fields the server marks as sortable", () => {
    useAdminUsersMock.mockReturnValue({
      ...createLoadedUsersState(),
      data: {
        ...createLoadedUsersState().data,
        sortableFields: ["fullName", "createdAt"],
      },
      items: createLoadedUsersState().data.items,
    });

    render(<AdminUsersView />);

    expect(screen.getByRole("button", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Joined" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Role" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verified" })).not.toBeInTheDocument();
  });

  it("shows a reset CTA when no users match the current filters", async () => {
    const user = userEvent.setup();
    const filters = {
      ...createBaseFilters(),
      role: "EDITOR" as const,
      activeFilterCount: 1,
      hasActiveFilters: true,
    };

    useAdminUsersFiltersMock.mockReturnValue(filters);
    useAdminUsersMock.mockReturnValue({
      data: {
        items: [],
        nextCursor: null,
        hasMore: false,
        totalItems: 0,
        limit: 20,
        sortBy: "createdAt",
        sortDirection: "desc",
        sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
      },
      items: [],
      isError: false,
      error: null,
      refetch: jest.fn(),
      isFetching: false,
      isInitialLoading: false,
      isPageTransitioning: false,
    });

    render(<AdminUsersView />);

    expect(screen.getByText("No users match these filters")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Clear Filters" })[0]);
    expect(filters.clearFilters).toHaveBeenCalled();
  });
});
