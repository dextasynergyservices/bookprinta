import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminAuditLogsLanding } from "./AdminAuditLogsLanding";

const routerReplaceMock = jest.fn();

const useAdminAuditLogsMock = jest.fn();
const useAdminErrorLogsMock = jest.fn();
const useAcknowledgeAdminErrorLogMutationMock = jest.fn();
const useAssignAdminErrorLogOwnerMutationMock = jest.fn();
const useResolveAdminErrorLogMutationMock = jest.fn();
const useAttachAdminErrorLogNoteMutationMock = jest.fn();

const acknowledgeMutateAsyncMock = jest.fn();
const assignMutateAsyncMock = jest.fn();
const resolveMutateAsyncMock = jest.fn();
const noteMutateAsyncMock = jest.fn();

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "reviews_filters_active") {
      return `${key}:${values?.count}`;
    }

    if (key === "audit_logs_assign_description") {
      return `${key}:${values?.fingerprint}`;
    }

    if (key === "audit_logs_note_description") {
      return `${key}:${values?.fingerprint}`;
    }

    return key;
  },
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/audit-logs",
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
  useSearchParams: () => new URLSearchParams(""),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mock-drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/hooks/useAdminLogs", () => ({
  normalizeAdminLogsError: (error: unknown) => ({
    title: "Action failed",
    description: error instanceof Error ? error.message : "unknown",
    fieldErrors: {},
  }),
  useAdminAuditLogs: (...args: unknown[]) => useAdminAuditLogsMock(...args),
  useAdminErrorLogs: (...args: unknown[]) => useAdminErrorLogsMock(...args),
  useAcknowledgeAdminErrorLogMutation: () => useAcknowledgeAdminErrorLogMutationMock(),
  useAssignAdminErrorLogOwnerMutation: () => useAssignAdminErrorLogOwnerMutationMock(),
  useResolveAdminErrorLogMutation: () => useResolveAdminErrorLogMutationMock(),
  useAttachAdminErrorLogNoteMutation: () => useAttachAdminErrorLogNoteMutationMock(),
}));

function createDefaultHooks() {
  useAdminAuditLogsMock.mockReturnValue({
    data: {
      items: [
        {
          id: "audit-1",
          timestamp: "2026-03-19T10:00:00.000Z",
          action: "UPDATE",
          actorUserId: "cm1actor",
          actorName: "Admin One",
          entityType: "system_setting",
          entityId: "production_delay_active",
          ipAddress: "127.0.0.1",
          userAgent: "jest-agent",
          details: { change: "enabled" },
        },
      ],
      nextCursor: null,
      hasMore: false,
      totalItems: 1,
      limit: 25,
    },
    items: [
      {
        id: "audit-1",
        timestamp: "2026-03-19T10:00:00.000Z",
        action: "UPDATE",
        actorUserId: "cm1actor",
        actorName: "Admin One",
        entityType: "system_setting",
        entityId: "production_delay_active",
        ipAddress: "127.0.0.1",
        userAgent: "jest-agent",
        details: { change: "enabled" },
      },
    ],
    nextCursor: null,
    hasMore: false,
    totalItems: 1,
    limit: 25,
    isError: false,
    isInitialLoading: false,
    isFetching: false,
    isPageTransitioning: false,
    error: null,
    refetch: jest.fn(),
  });

  useAdminErrorLogsMock.mockReturnValue({
    data: {
      items: [
        {
          id: "error-1",
          timestamp: "2026-03-19T11:00:00.000Z",
          severity: "error",
          status: "open",
          service: "payments",
          message: "Webhook timeout",
          fingerprint: "fp-open",
          environment: "production",
          ownerUserId: null,
          ownerName: null,
          suggestedAction: "Retry webhook",
          metadata: { requestId: "req-open" },
        },
        {
          id: "error-2",
          timestamp: "2026-03-19T12:00:00.000Z",
          severity: "warn",
          status: "resolved",
          service: "engine",
          message: "Delayed queue burst",
          fingerprint: "fp-resolved",
          environment: "production",
          ownerUserId: "cm1owner",
          ownerName: "Owner Two",
          suggestedAction: null,
          metadata: { requestId: "req-resolved" },
        },
      ],
      nextCursor: null,
      hasMore: false,
      totalItems: 2,
      limit: 25,
    },
    items: [
      {
        id: "error-1",
        timestamp: "2026-03-19T11:00:00.000Z",
        severity: "error",
        status: "open",
        service: "payments",
        message: "Webhook timeout",
        fingerprint: "fp-open",
        environment: "production",
        ownerUserId: null,
        ownerName: null,
        suggestedAction: "Retry webhook",
        metadata: { requestId: "req-open" },
      },
      {
        id: "error-2",
        timestamp: "2026-03-19T12:00:00.000Z",
        severity: "warn",
        status: "resolved",
        service: "engine",
        message: "Delayed queue burst",
        fingerprint: "fp-resolved",
        environment: "production",
        ownerUserId: "cm1owner",
        ownerName: "Owner Two",
        suggestedAction: null,
        metadata: { requestId: "req-resolved" },
      },
    ],
    nextCursor: null,
    hasMore: false,
    totalItems: 2,
    limit: 25,
    isError: false,
    isInitialLoading: false,
    isFetching: false,
    isPageTransitioning: false,
    error: null,
    refetch: jest.fn(),
  });

  useAcknowledgeAdminErrorLogMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: acknowledgeMutateAsyncMock.mockResolvedValue({
      id: "error-1",
      status: "acknowledged",
    }),
  });

  useAssignAdminErrorLogOwnerMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: assignMutateAsyncMock.mockResolvedValue({
      id: "error-1",
      ownerUserId: "cm1owner",
    }),
  });

  useResolveAdminErrorLogMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: resolveMutateAsyncMock.mockResolvedValue({ id: "error-1", status: "resolved" }),
  });

  useAttachAdminErrorLogNoteMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: noteMutateAsyncMock.mockResolvedValue({ id: "error-1", note: "working" }),
  });
}

describe("AdminAuditLogsLanding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createDefaultHooks();
  });

  it("switches between audit and error tabs", async () => {
    const user = userEvent.setup();
    render(<AdminAuditLogsLanding />);

    expect(screen.getAllByText("Admin One").length).toBeGreaterThan(0);
    expect(screen.queryByText("Webhook timeout")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "audit_logs_tab_errors" }));

    expect((await screen.findAllByText("Webhook timeout")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Admin One")).toHaveLength(0);
  });

  it("supports mobile drawer filter interaction", async () => {
    const user = userEvent.setup();
    render(<AdminAuditLogsLanding />);

    await user.click(screen.getByRole("button", { name: "audit_logs_filter_button" }));

    const dialog = await screen.findByRole("dialog");
    const searchInput = within(dialog).getByPlaceholderText("audit_logs_filter_search");
    await user.clear(searchInput);
    await user.type(searchInput, "lagos");
    await user.click(within(dialog).getByRole("button", { name: "audit_logs_filter_apply" }));

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalled();
    });

    const calls = routerReplaceMock.mock.calls.map((call) => String(call[0]));
    expect(calls.some((value) => value.includes("aq=lagos"))).toBe(true);
  });

  it("expands and collapses metadata rows", async () => {
    const user = userEvent.setup();
    render(<AdminAuditLogsLanding />);

    const expandButtons = screen.getAllByRole("button", { name: "audit_logs_expand" });
    await user.click(expandButtons[0]);

    expect(screen.getAllByText(/"details"/).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "audit_logs_collapse" })[0]);

    expect(screen.queryAllByText(/"details"/)).toHaveLength(0);
  });

  it("shows actions menu with disabled states based on row status", async () => {
    const user = userEvent.setup();
    render(<AdminAuditLogsLanding />);

    await user.click(screen.getByRole("tab", { name: "audit_logs_tab_errors" }));

    const actionMenus = screen.getAllByRole("button", { name: "audit_logs_action_menu" });

    await user.click(actionMenus[0]);

    const acknowledgeEnabled = await screen.findByRole("menuitem", {
      name: "audit_logs_action_acknowledge",
    });
    const resolveEnabled = screen.getByRole("menuitem", {
      name: "audit_logs_action_resolve",
    });

    expect(acknowledgeEnabled).not.toHaveAttribute("data-disabled");
    expect(resolveEnabled).not.toHaveAttribute("data-disabled");

    await user.keyboard("{Escape}");

    const resolvedCard = screen
      .getAllByText("Delayed queue burst")
      .map((node) => node.closest("article"))
      .find((node): node is HTMLElement => Boolean(node));

    expect(resolvedCard).toBeDefined();

    await user.click(
      within(resolvedCard as HTMLElement).getByRole("button", { name: "audit_logs_action_menu" })
    );

    const acknowledgeDisabled = await screen.findByRole("menuitem", {
      name: "audit_logs_action_acknowledge",
    });
    const noteDisabled = screen.getByRole("menuitem", {
      name: "audit_logs_action_add_note",
    });
    const resolveDisabled = screen.getByRole("menuitem", {
      name: "audit_logs_action_resolve",
    });

    expect(acknowledgeDisabled).toHaveAttribute("data-disabled");
    expect(noteDisabled).toHaveAttribute("data-disabled");
    expect(resolveDisabled).toHaveAttribute("data-disabled");
  });
});
