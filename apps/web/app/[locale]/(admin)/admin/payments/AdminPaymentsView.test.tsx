import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminPaymentsView } from "./AdminPaymentsView";

const usePendingBankTransfersMock = jest.fn();
const useAdminApproveBankTransferMutationMock = jest.fn();
const useAdminRejectBankTransferMutationMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

const translations: Record<string, string> = {
  payments_pending_eyebrow: "Payment Operations",
  payments_pending_title: "Pending Bank Transfers",
  payments_workspace_description:
    "Prioritize bank transfer approvals, keep the SLA queue moving, and clear receipts before they become overdue.",
  payments_pending_description:
    "Review receipts, check payer details, and approve or reject transfers without leaving the admin workspace.",
  payments_pending_summary_label: "Queue Snapshot",
  payments_pending_summary_total: "{count} pending approvals",
  payments_pending_sorting_hint: "Oldest first, auto-refresh every 60 seconds",
  payments_pending_summary_refreshed: "Updated {date}",
  payments_pending_summary_notice:
    "Approving a transfer also sends the customer's registration link.",
  payments_pending_waiting: "Time Waiting",
  payments_pending_table_payer: "Payer",
  payments_pending_table_amount: "Amount",
  payments_pending_table_receipt: "Receipt",
  payments_pending_table_context: "Context",
  payments_pending_table_actions: "Actions",
  payments_pending_payer_unknown: "Payer unavailable",
  payments_pending_amount: "Amount: {amount}",
  payments_pending_received: "Received {date}",
  payments_pending_email_missing: "Email unavailable",
  payments_pending_phone_missing: "Phone unavailable",
  payments_pending_receipt_action: "View Receipt",
  payments_pending_receipt_missing: "Receipt unavailable",
  payments_pending_provider_ref: "Provider ref: {reference}",
  payments_pending_provider_ref_missing: "Pending reference",
  payments_pending_email: "Customer email: {email}",
  payments_pending_phone: "Customer phone: {phone}",
  payments_pending_meta_admin_note: "Admin Note",
  payments_pending_approve_loading: "Approving & sending registration link",
  payments_pending_approve_action: "Approve & Send Registration Link",
  payments_pending_reject_action: "Reject Transfer",
  payments_pending_error_title: "Unable to load pending bank transfers",
  payments_pending_error_description:
    "The SLA queue could not be loaded right now. Retry to pull the latest waiting transfers.",
  payments_pending_retry: "Retry Queue",
  payments_pending_empty_title: "No bank transfers are waiting",
  payments_pending_empty_description:
    "New bank transfer submissions will appear here automatically as they arrive.",
  payments_pending_reject_dialog_title: "Reject Bank Transfer",
  payments_pending_reject_dialog_description:
    "Add a reason before rejecting this transfer. The customer will be notified.",
  payments_pending_reject_reason_label: "Rejection reason",
  payments_pending_reject_reason_placeholder: "Explain why the transfer is being rejected.",
  payments_pending_reject_disabled: "Add a rejection reason before you submit this action.",
  payments_pending_reject_cancel: "Cancel",
  payments_pending_reject_confirm: "Reject Transfer",
  payments_pending_reject_loading: "Rejecting Transfer",
  payments_pending_toast_approved_title: "Bank transfer approved",
  payments_pending_toast_approved_description:
    "The registration link has been sent to the customer.",
  payments_pending_toast_rejected_title: "Bank transfer rejected",
  payments_pending_toast_rejected_description:
    "The customer has been notified about the rejection.",
  payments_pending_toast_error_title: "Payment action failed",
  payments_receipt_lightbox_title: "Receipt Preview",
  payments_receipt_lightbox_description:
    "Review the uploaded receipt before approving or rejecting this bank transfer.",
  payments_receipt_lightbox_alt: "Receipt for {payer} on order {orderReference}",
  payments_receipt_lightbox_order_reference: "Order {orderReference}",
  payments_receipt_lightbox_loading: "Loading receipt preview...",
  payments_receipt_lightbox_error_title: "Unable to display this receipt",
  payments_receipt_lightbox_error_description:
    "This file could not be previewed in the lightbox. Open it in a new tab to inspect the upload directly.",
  payments_receipt_lightbox_hint:
    "Double-check the receipt details uploaded by {payer} before taking action.",
  payments_receipt_lightbox_close: "Close Preview",
  payments_receipt_lightbox_open_external: "Open in New Tab",
  payments_date_unavailable: "Date unavailable",
  payments_total_unavailable: "Amount unavailable",
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

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    loader: _loader,
    unoptimized: _unoptimized,
    ...props
  }: {
    alt: string;
    src: string;
    loader?: unknown;
    unoptimized?: boolean;
    [key: string]: unknown;
  }) => {
    const React = require("react") as typeof import("react");
    return React.createElement("img", { alt, src, ...props });
  },
}));

jest.mock("framer-motion", () => {
  const React = require("react") as typeof import("react");
  const MOTION_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "whileHover",
    "whileTap",
    "whileInView",
    "viewport",
    "layout",
  ]);
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(function MotionPrimitive(
          { children, ...props }: React.HTMLAttributes<HTMLElement>,
          ref
        ) {
          const domProps = Object.fromEntries(
            Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key))
          );
          return React.createElement(tag, { ...domProps, ref }, children);
        }),
    }
  );

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion,
  };
});

jest.mock("@/components/dashboard/dashboard-content-frame", () => ({
  DashboardResponsiveDataRegion: ({ mobileCards }: { mobileCards: ReactNode }) => (
    <div>{mobileCards}</div>
  ),
  DashboardTableViewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/hooks/useAdminPayments", () => ({
  usePendingBankTransfers: () => usePendingBankTransfersMock(),
}));

jest.mock("@/hooks/useAdminPaymentActions", () => ({
  getAdminPaymentRejectActionState: (reason: string) => ({
    canSubmit: reason.trim().length > 0,
    normalizedReason: reason.trim(),
    disabledReason:
      reason.trim().length > 0 ? null : "Add a rejection reason before rejecting this transfer.",
  }),
  useAdminApproveBankTransferMutation: () => useAdminApproveBankTransferMutationMock(),
  useAdminRejectBankTransferMutation: () => useAdminRejectBankTransferMutationMock(),
}));

jest.mock("./AllPaymentsSection", () => ({
  AllPaymentsSection: () => <div>All Payments Stub</div>,
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function createPendingTransfersState() {
  return {
    data: {
      items: [],
      totalItems: 1,
      refreshedAt: "2026-03-13T10:15:00.000Z",
    },
    items: [
      {
        id: "pay_1",
        orderReference: "BP-REF-001",
        orderNumber: "BP-1001",
        orderId: "ord_1",
        userId: "user_1",
        customer: {
          id: "user_1",
          fullName: "Ada Okafor",
          email: "ada@example.com",
          phoneNumber: "+2348012345678",
          preferredLanguage: "en",
        },
        provider: "BANK_TRANSFER",
        type: "INITIAL",
        status: "AWAITING_APPROVAL",
        amount: 50000,
        currency: "NGN",
        providerRef: "ref_12345",
        receiptUrl: "https://example.com/receipt.jpg",
        payerName: "Ada Okafor",
        payerEmail: "ada@example.com",
        payerPhone: "+2348012345678",
        adminNote: "Receipt uploaded with handwritten teller reference.",
        hasAdminNote: true,
        approvedAt: null,
        approvedBy: null,
        processedAt: null,
        createdAt: "2026-03-13T09:33:00.000Z",
        updatedAt: "2026-03-13T09:33:00.000Z",
        refundability: {
          isRefundable: false,
          processingMode: "manual",
          reason: "Pending approval",
          policySnapshot: null,
          orderVersion: null,
          bookVersion: null,
        },
        slaSnapshot: {
          ageMinutes: 42,
          state: "red",
        },
        liveSla: {
          ageMinutes: 42,
          label: "42m",
          ariaLabel: "42 minutes waiting",
          state: "red",
          isOverdue: true,
        },
      },
    ],
    totalItems: 1,
    refreshedAt: "2026-03-13T10:15:00.000Z",
    isInitialLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  };
}

function createPendingTransfer(params: {
  id: string;
  orderReference: string;
  label: string;
  ariaLabel: string;
  state: "green" | "yellow" | "red";
  ageMinutes: number;
}) {
  return {
    id: params.id,
    orderReference: params.orderReference,
    orderNumber: params.orderReference,
    orderId: `ord_${params.id}`,
    userId: `user_${params.id}`,
    customer: {
      id: `user_${params.id}`,
      fullName: `Author ${params.id}`,
      email: `${params.id}@example.com`,
      phoneNumber: "+2348012345678",
      preferredLanguage: "en",
    },
    provider: "BANK_TRANSFER",
    type: "INITIAL",
    status: "AWAITING_APPROVAL",
    amount: 50000,
    currency: "NGN",
    providerRef: `ref_${params.id}`,
    receiptUrl: `https://example.com/${params.id}.jpg`,
    payerName: `Author ${params.id}`,
    payerEmail: `${params.id}@example.com`,
    payerPhone: "+2348012345678",
    adminNote: null,
    hasAdminNote: false,
    approvedAt: null,
    approvedBy: null,
    processedAt: null,
    createdAt: "2026-03-13T09:33:00.000Z",
    updatedAt: "2026-03-13T09:33:00.000Z",
    refundability: {
      isRefundable: false,
      processingMode: "manual",
      reason: "Pending approval",
      policySnapshot: null,
      orderVersion: null,
      bookVersion: null,
    },
    slaSnapshot: {
      ageMinutes: params.ageMinutes,
      state: params.state,
    },
    liveSla: {
      ageMinutes: params.ageMinutes,
      label: params.label,
      ariaLabel: params.ariaLabel,
      state: params.state,
      isOverdue: params.state === "red",
    },
  };
}

describe("AdminPaymentsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePendingBankTransfersMock.mockReturnValue(createPendingTransfersState());
    useAdminApproveBankTransferMutationMock.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({
        id: "pay_1",
        status: "SUCCESS",
      }),
      isPending: false,
    });
    useAdminRejectBankTransferMutationMock.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({
        id: "pay_1",
        status: "FAILED",
      }),
      isPending: false,
    });
  });

  it("renders the overdue SLA card with explicit registration-link approval copy", () => {
    render(<AdminPaymentsView />);

    expect(screen.getByText("Pending Bank Transfers")).toBeInTheDocument();
    expect(screen.getByText("42m").closest("p")).toHaveClass("text-[#EF4444]");
    expect(screen.getByRole("button", { name: "View Receipt" })).toBeInTheDocument();
    expect(screen.getByText("Admin Note")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve & Send Registration Link" })
    ).toBeInTheDocument();
  });

  it("maps 14, 15, and 30 minute SLA thresholds to the required timer colors", () => {
    usePendingBankTransfersMock.mockReturnValue({
      ...createPendingTransfersState(),
      data: {
        items: [],
        totalItems: 3,
        refreshedAt: "2026-03-13T10:15:00.000Z",
      },
      items: [
        createPendingTransfer({
          id: "green",
          orderReference: "BP-GREEN",
          label: "14m",
          ariaLabel: "14 minutes waiting",
          ageMinutes: 14,
          state: "green",
        }),
        createPendingTransfer({
          id: "yellow",
          orderReference: "BP-YELLOW",
          label: "15m",
          ariaLabel: "15 minutes waiting",
          ageMinutes: 15,
          state: "yellow",
        }),
        createPendingTransfer({
          id: "red",
          orderReference: "BP-RED",
          label: "30m",
          ariaLabel: "30 minutes waiting",
          ageMinutes: 30,
          state: "red",
        }),
      ],
      totalItems: 3,
    });

    render(<AdminPaymentsView />);

    expect(screen.getByText("14m").closest("p")).toHaveClass("text-[#22C55E]");
    expect(screen.getByText("15m").closest("p")).toHaveClass("text-[#EAB308]");
    expect(screen.getByText("30m").closest("p")).toHaveClass("text-[#EF4444]");
  });

  it("opens the receipt lightbox and closes it on outside click and escape", async () => {
    const user = userEvent.setup();

    render(<AdminPaymentsView />);

    await user.click(screen.getByRole("button", { name: "View Receipt" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Receipt Preview")).toBeInTheDocument();
    expect(screen.getByText("Loading receipt preview...")).toBeInTheDocument();
    expect(screen.getByAltText("Receipt for Ada Okafor on order BP-REF-001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in New Tab" })).toHaveAttribute(
      "href",
      "https://example.com/receipt.jpg"
    );

    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(overlay).toBeInstanceOf(HTMLElement);

    await user.click(overlay as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "View Receipt" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps rejection disabled until a reason is entered and submits the trimmed note", async () => {
    const user = userEvent.setup();
    const rejectMutation = jest.fn().mockResolvedValue({
      id: "pay_1",
      status: "FAILED",
    });

    useAdminRejectBankTransferMutationMock.mockReturnValue({
      mutateAsync: rejectMutation,
      isPending: false,
    });

    render(<AdminPaymentsView />);

    await user.click(screen.getByRole("button", { name: "Reject Transfer" }));

    const dialog = screen.getByRole("dialog");
    const rejectConfirmButton = within(dialog).getByRole("button", { name: "Reject Transfer" });
    expect(rejectConfirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Rejection reason"), "  Receipt does not match  ");
    expect(rejectConfirmButton).toBeEnabled();

    await user.click(rejectConfirmButton);

    await waitFor(() =>
      expect(rejectMutation).toHaveBeenCalledWith({
        paymentId: "pay_1",
        orderId: "ord_1",
        adminNote: "Receipt does not match",
      })
    );
  });

  it("renders the empty queue state when no bank transfers are waiting", () => {
    usePendingBankTransfersMock.mockReturnValue({
      ...createPendingTransfersState(),
      data: {
        items: [],
        totalItems: 0,
        refreshedAt: "2026-03-13T10:15:00.000Z",
      },
      items: [],
      totalItems: 0,
    });

    render(<AdminPaymentsView />);

    expect(screen.getByText("No bank transfers are waiting")).toBeInTheDocument();
    expect(
      screen.getByText(
        "New bank transfer submissions will appear here automatically as they arrive."
      )
    ).toBeInTheDocument();
  });
});
