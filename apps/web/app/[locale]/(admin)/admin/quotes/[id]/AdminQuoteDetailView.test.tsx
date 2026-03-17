import type { AdminQuoteDetail } from "@bookprinta/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AdminQuoteDetailView } from "./AdminQuoteDetailView";

const useAdminQuoteDetailMock = jest.fn();
const useAdminQuotePatchMutationMock = jest.fn();
const useAdminGenerateQuotePaymentLinkMutationMock = jest.fn();
const useAdminRevokeQuotePaymentLinkMutationMock = jest.fn();
const useAdminDeleteQuoteMutationMock = jest.fn();
const routerReplaceMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  quotes_back_to_list: "Back to Quotes",
  quotes_detail_description: "Detail workspace",
  quotes_timeline_sent: "Sent",
  quotes_timeline_expired: "Expired",
  quotes_timeline_paid: "Paid",
  quotes_table_created: "Created",
  users_detail_updated: "Last Updated",
  quotes_date_unavailable: "Date unavailable",
  quotes_detail_wizard_eyebrow: "Submission",
  quotes_detail_wizard_title: "Wizard Data",
  quotes_detail_wizard_description: "Wizard description",
  quotes_detail_step_1_label: "Step 1",
  quotes_detail_step_1_title: "Manuscript Basics",
  quotes_detail_step_2_label: "Step 2",
  quotes_detail_step_2_title: "Print Configuration",
  quotes_detail_step_3_label: "Step 3",
  quotes_detail_step_3_title: "Special Requirements",
  quotes_detail_step_4_label: "Step 4",
  quotes_detail_step_4_title: "Contact Details",
  quotes_detail_field_working_title: "Working Title",
  quotes_detail_field_word_count: "Estimated Word Count",
  quotes_detail_field_print_size: "Print Size",
  quotes_detail_field_quantity: "Quantity",
  quotes_detail_field_cover_type: "Cover Type",
  quotes_detail_field_phone: "Phone",
  quotes_detail_field_has_special_reqs: "Has Special Requirements",
  quotes_detail_field_special_reqs: "Requirement List",
  quotes_detail_field_special_reqs_other: "Other Requirement",
  quotes_detail_yes: "Yes",
  quotes_detail_no: "No",
  quotes_detail_none: "None",
  quotes_table_customer: "Customer",
  quotes_table_email: "Email",
  quotes_table_estimate: "Estimate",
  quotes_detail_estimate_title: "Estimate Summary",
  quotes_detail_estimate_description: "Estimate description",
  quotes_estimate_manual: "Manual pricing required",
  quotes_detail_notes_eyebrow: "Internal",
  quotes_detail_notes_title: "Admin Notes",
  quotes_detail_notes_description: "Autosave on blur",
  quotes_detail_notes_placeholder: "Add internal context",
  quotes_detail_notes_saving: "Saving notes",
  quotes_detail_notes_saved: "Notes saved",
  quotes_detail_notes_error_title: "Unable to save notes",
  quotes_detail_notes_error_description: "Rollback note",
  quotes_detail_payment_link_eyebrow: "Payment",
  quotes_detail_payment_link_title: "Payment Link",
  quotes_detail_payment_link_description: "Link controls",
  quotes_detail_identity_conflict_title: "Identity mismatch helper",
  quotes_detail_identity_conflict_description:
    "If the customer reports mismatch, email and phone resolve to different users.",
  quotes_detail_identity_conflict_email_hint: "Email already used hint",
  quotes_detail_identity_conflict_phone_hint: "Phone already used hint",
  quotes_detail_identity_conflict_both_hint: "Both mismatch hint",
  quotes_detail_identity_conflict_action: "Revoke and regenerate action",
  quotes_detail_identity_conflict_detected_label: "Detected conflict",
  quotes_detail_identity_conflict_detected_email:
    "Email is already in use by an existing user account.",
  quotes_detail_identity_conflict_detected_phone:
    "Phone number is already in use by an existing user account.",
  quotes_detail_identity_conflict_detected_both:
    "Email and phone belong to different existing user accounts.",
  quotes_detail_identity_conflict_detected_deactivated_email:
    "Email belongs to a deactivated account. Ask for another active email.",
  quotes_detail_final_price_label: "Final Price (NGN)",
  quotes_detail_final_price_placeholder: "e.g. 180000",
  quotes_detail_invalid_price: "Enter a valid NGN amount",
  quotes_detail_generate_button: "Generate Payment Link",
  quotes_detail_generate_loading: "Generating link",
  quotes_detail_generate_success_title: "Payment link generated",
  quotes_detail_generate_success_description: "Current link status: {status}",
  quotes_detail_generate_error_title: "Unable to generate payment link",
  quotes_detail_generate_error_description: "Generate error",
  quotes_detail_generate_invalid_price_title: "Final price required",
  quotes_detail_generate_invalid_price_description: "Enter valid amount",
  quotes_detail_generated_url_label: "Generated URL",
  quotes_detail_copy_button: "Copy URL",
  quotes_detail_copy_success: "Payment URL copied",
  quotes_detail_copy_error_title: "Unable to copy URL",
  quotes_detail_copy_error_description: "Copy manually",
  quotes_detail_expires_label: "Expires:",
  quotes_detail_revoke_button: "Revoke Link",
  quotes_detail_revoke_loading: "Revoking link",
  quotes_detail_revoke_reason_label: "Revoke Reason",
  quotes_detail_revoke_reason_placeholder: "Provide revoke reason",
  quotes_detail_revoke_reason_required_title: "Revoke reason required",
  quotes_detail_revoke_reason_required_description: "Provide at least 5 characters",
  quotes_detail_revoke_notify_customer: "Send an email update to the customer",
  quotes_detail_revoke_customer_message_label: "Customer Message (Optional)",
  quotes_detail_revoke_customer_message_placeholder: "Optional customer message",
  quotes_detail_revoke_email_success_title: "Customer notification email sent",
  quotes_detail_revoke_email_error_title: "Unable to deliver customer notification email",
  quotes_detail_revoke_email_error_description:
    "The payment link was revoked but the email could not be delivered.",
  quotes_detail_revoke_confirm_message:
    "Revoke this payment link and return the quote to reviewing?",
  quotes_detail_revoke_success_title: "Payment link revoked",
  quotes_detail_revoke_error_title: "Unable to revoke payment link",
  quotes_detail_revoke_error_description: "Revoke error",
  quotes_detail_error_title: "Unable to load quote details",
  quotes_detail_error_description: "Could not load quote",
  quotes_detail_refetch: "Reload Quote",
  quotes_action_delete: "Delete Quote",
  quotes_delete_dialog_title: "Delete this quote?",
  quotes_delete_dialog_description:
    "This is a soft delete. The quote leaves active views and remains only in audit records.",
  quotes_dialog_reason_label: "Reason",
  quotes_dialog_reason_placeholder: "Provide context for this action.",
  quotes_delete_dialog_confirm_label: "Type DELETE to confirm",
  quotes_error_description: "Generic quote error",
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

jest.mock("@/hooks/useAdminQuoteDetail", () => ({
  useAdminQuoteDetail: (input: unknown) => useAdminQuoteDetailMock(input),
}));

jest.mock("@/hooks/useAdminQuoteActions", () => ({
  useAdminQuotePatchMutation: () => useAdminQuotePatchMutationMock(),
  useAdminGenerateQuotePaymentLinkMutation: () => useAdminGenerateQuotePaymentLinkMutationMock(),
  useAdminRevokeQuotePaymentLinkMutation: () => useAdminRevokeQuotePaymentLinkMutationMock(),
  useAdminDeleteQuoteMutation: () => useAdminDeleteQuoteMutationMock(),
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
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function createBaseQuote(overrides?: Partial<AdminQuoteDetail>): AdminQuoteDetail {
  return {
    id: "cmquote1111111111111111111111",
    status: "PAYMENT_LINK_SENT",
    manuscript: {
      workingTitle: "The Fourth River",
      estimatedWordCount: 34000,
    },
    print: {
      bookPrintSize: "A5",
      quantity: 100,
      coverType: "paperback",
    },
    specialRequirements: {
      hasSpecialReqs: false,
      specialReqs: [],
      specialReqsOther: null,
    },
    contact: {
      fullName: "Ada Okafor",
      email: "ada@example.com",
      phone: "+2348012345678",
    },
    estimate: {
      mode: "RANGE",
      estimatedPriceLow: 120000,
      estimatedPriceHigh: 140000,
      label: "NGN 120,000 - NGN 140,000",
    },
    adminNotes: "Existing note",
    finalPrice: 180000,
    paymentLink: {
      token: "token-123",
      url: "https://bookprinta.test/pay/token-123",
      expiresAt: "2026-03-24T10:00:00.000Z",
      generatedAt: "2026-03-17T10:00:00.000Z",
      displayStatus: "SENT",
      validityDays: 7,
    },
    actions: {
      canReject: true,
      canArchive: false,
      canDelete: false,
      canRevokePaymentLink: true,
    },
    createdAt: "2026-03-16T10:00:00.000Z",
    updatedAt: "2026-03-16T10:10:00.000Z",
    ...overrides,
  };
}

function createDetailHookState(quote: AdminQuoteDetail) {
  return {
    quote,
    data: quote,
    isInitialLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
}

function createMutationShape<T = unknown>() {
  return {
    mutateAsync: jest.fn<Promise<T>, [unknown]>(),
    isPending: false,
  };
}

describe("AdminQuoteDetailView", () => {
  const quoteId = "cmquote1111111111111111111111";
  const clipboardWriteTextMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    useAdminQuoteDetailMock.mockReturnValue(createDetailHookState(createBaseQuote()));
    useAdminQuotePatchMutationMock.mockReturnValue(createMutationShape());
    useAdminGenerateQuotePaymentLinkMutationMock.mockReturnValue(createMutationShape());
    useAdminRevokeQuotePaymentLinkMutationMock.mockReturnValue(createMutationShape());
    useAdminDeleteQuoteMutationMock.mockReturnValue(createMutationShape());
    routerReplaceMock.mockReset();

    (toast.success as jest.Mock).mockReset();
    (toast.error as jest.Mock).mockReset();
    clipboardWriteTextMock.mockReset();
    Object.defineProperty(window.Navigator.prototype, "clipboard", {
      configurable: true,
      get: () => ({
        writeText: clipboardWriteTextMock,
      }),
    });
  });

  it("autosaves notes on blur via PATCH and keeps new value on success", async () => {
    const user = userEvent.setup();
    const patchMutation = createMutationShape();
    patchMutation.mutateAsync.mockResolvedValue({
      id: quoteId,
      status: "PAYMENT_LINK_SENT",
      adminNotes: "Fresh note",
      finalPrice: 180000,
      updatedAt: "2026-03-16T10:20:00.000Z",
    });
    useAdminQuotePatchMutationMock.mockReturnValue(patchMutation);

    render(<AdminQuoteDetailView quoteId={quoteId} />);

    const notes = screen.getByPlaceholderText("Add internal context") as HTMLTextAreaElement;

    await user.clear(notes);
    await user.type(notes, "Fresh note");
    fireEvent.blur(notes);

    await waitFor(() => {
      expect(patchMutation.mutateAsync).toHaveBeenCalledWith({
        quoteId,
        input: {
          adminNotes: "Fresh note",
        },
      });
    });

    expect(notes).toHaveValue("Fresh note");
  });

  it("renders loading skeleton blocks while detail query is initial-loading", () => {
    useAdminQuoteDetailMock.mockReturnValue({
      quote: null,
      data: null,
      isInitialLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const { container } = render(<AdminQuoteDetailView quoteId={quoteId} />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(4);
  });

  it("rolls notes back to the original value when autosave fails", async () => {
    const user = userEvent.setup();
    const patchMutation = createMutationShape();
    patchMutation.mutateAsync.mockRejectedValue(new Error("Patch failed"));
    useAdminQuotePatchMutationMock.mockReturnValue(patchMutation);

    render(<AdminQuoteDetailView quoteId={quoteId} />);

    const notes = screen.getByPlaceholderText("Add internal context") as HTMLTextAreaElement;

    await user.clear(notes);
    await user.type(notes, "Will fail");
    fireEvent.blur(notes);

    await waitFor(() => {
      expect(patchMutation.mutateAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(notes).toHaveValue("Existing note");
    });
  });

  it("generates a payment link from final NGN price", async () => {
    const user = userEvent.setup();
    const generateMutation = createMutationShape();
    generateMutation.mutateAsync.mockResolvedValue({
      id: quoteId,
      status: "PAYMENT_LINK_SENT",
      paymentLink: {
        token: "token-456",
        url: "https://bookprinta.test/pay/token-456",
        expiresAt: "2026-03-24T10:00:00.000Z",
        generatedAt: "2026-03-17T10:00:00.000Z",
        displayStatus: "SENT",
        validityDays: 7,
      },
      delivery: {
        attemptedAt: "2026-03-17T10:00:00.000Z",
        email: { attempted: true, delivered: true, failureReason: null },
        whatsapp: { attempted: true, delivered: true, failureReason: null },
      },
    });
    useAdminGenerateQuotePaymentLinkMutationMock.mockReturnValue(generateMutation);

    render(<AdminQuoteDetailView quoteId={quoteId} />);

    const priceInput = screen.getByLabelText("Final Price (NGN)");
    const generateButton = screen.getByRole("button", { name: "Generate Payment Link" });
    expect(generateButton).toHaveAttribute("aria-busy", "false");

    await user.clear(priceInput);
    await user.type(priceInput, "200000");

    generateButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(generateMutation.mutateAsync).toHaveBeenCalledWith({
        quoteId,
        input: {
          finalPrice: 200000,
        },
      });
    });
  });

  it("triggers copy link user feedback when the copy button is pressed", async () => {
    const user = userEvent.setup();
    clipboardWriteTextMock.mockResolvedValue(undefined);

    render(<AdminQuoteDetailView quoteId={quoteId} />);

    const copyButton = screen.getByRole("button", { name: "Copy URL" });
    expect(copyButton).toHaveAttribute("aria-label", "Copy URL");

    await user.click(copyButton);

    await waitFor(() => {
      expect(
        (toast.success as jest.Mock).mock.calls.length +
          (toast.error as jest.Mock).mock.calls.length
      ).toBeGreaterThan(0);
    });
  });

  it("renders timeline chips and revokes an active link", async () => {
    const user = userEvent.setup();
    const revokeMutation = createMutationShape();
    revokeMutation.mutateAsync.mockResolvedValue({
      id: quoteId,
      status: "REVIEWING",
      paymentLink: {
        token: null,
        url: null,
        expiresAt: null,
        generatedAt: null,
        displayStatus: "NOT_SENT",
        validityDays: 7,
      },
      delivery: {
        email: { attempted: false, delivered: false, failureReason: null },
      },
      revoked: true,
    });
    useAdminRevokeQuotePaymentLinkMutationMock.mockReturnValue(revokeMutation);

    useAdminQuoteDetailMock.mockReturnValue(
      createDetailHookState(
        createBaseQuote({
          paymentLink: {
            token: "token-123",
            url: "https://bookprinta.test/pay/token-123",
            expiresAt: "2026-03-15T10:00:00.000Z",
            generatedAt: "2026-03-08T10:00:00.000Z",
            displayStatus: "EXPIRED",
            validityDays: 7,
          },
        })
      )
    );

    render(<AdminQuoteDetailView quoteId={quoteId} />);

    const expiredChip = screen.getByText("Expired");
    const sentChip = screen.getByText("Sent");
    const paidChip = screen.getByText("Paid");

    expect(expiredChip.className).toContain("text-[#7bc0ff]");
    expect(sentChip.className).toContain("text-[#8F8F8F]");
    expect(paidChip.className).toContain("text-[#8F8F8F]");

    await user.type(
      screen.getByLabelText("Revoke Reason"),
      "Customer asked to update contact details before payment"
    );

    await user.click(screen.getByRole("button", { name: "Revoke Link" }));

    await waitFor(() => {
      expect(revokeMutation.mutateAsync).toHaveBeenCalledWith({
        quoteId,
        input: {
          reason: "Customer asked to update contact details before payment",
          notifyCustomer: false,
          customerMessage: null,
        },
      });
    });
  });

  it("shows detected conflict block when backend returns email+phone mismatch", async () => {
    const user = userEvent.setup();
    const contactPatchMutation = createMutationShape();
    const conflictMessage =
      "This email and phone number belong to different accounts. Update one field so both resolve to the same customer account.";
    contactPatchMutation.mutateAsync.mockRejectedValue(new Error(conflictMessage));
    useAdminQuotePatchMutationMock.mockReturnValue(contactPatchMutation);

    render(<AdminQuoteDetailView quoteId={quoteId} />);

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "different@example.com");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "+2348099991111");
    await user.click(screen.getByRole("button", { name: "quotes_detail_contact_save" }));

    await waitFor(() => {
      expect(contactPatchMutation.mutateAsync).toHaveBeenCalled();
    });

    expect(screen.getByText("Detected conflict")).toBeInTheDocument();
    expect(
      screen.getByText("Email and phone belong to different existing user accounts.")
    ).toBeInTheDocument();
    expect(screen.getByText(conflictMessage)).toBeInTheDocument();
  });

  it("deletes from detail view when reason is provided and DELETE is confirmed", async () => {
    const user = userEvent.setup();
    const deleteMutation = createMutationShape();
    deleteMutation.mutateAsync.mockResolvedValue({
      id: quoteId,
      deleted: true,
      deletedAt: "2026-03-17T10:10:00.000Z",
    });
    useAdminDeleteQuoteMutationMock.mockReturnValue(deleteMutation);
    useAdminQuoteDetailMock.mockReturnValue(
      createDetailHookState(
        createBaseQuote({
          status: "REVIEWING",
          paymentLink: {
            token: null,
            url: null,
            expiresAt: null,
            generatedAt: null,
            displayStatus: "NOT_SENT",
            validityDays: 7,
          },
          actions: {
            canReject: true,
            canArchive: true,
            canDelete: true,
            canRevokePaymentLink: false,
          },
        })
      )
    );

    render(<AdminQuoteDetailView quoteId={quoteId} />);

    await user.type(screen.getByLabelText("Reason"), "Customer requested cancellation");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete Quote" }));

    await waitFor(() => {
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith({
        quoteId,
        input: {
          reason: "Customer requested cancellation",
          confirmText: "DELETE",
        },
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Delete Quote");
    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/quotes");
  });
});
