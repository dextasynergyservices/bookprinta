import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { BooksView } from "./BooksView";

const approveBookForProductionMock = jest.fn();
const reprocessBookManuscriptMock = jest.fn();
const useBookProgressMock = jest.fn();
const useBookPreviewMock = jest.fn();
const useBookFilesMock = jest.fn();
const useBookReprintConfigMock = jest.fn();
const useOrderDetailMock = jest.fn();
const useOrdersMock = jest.fn();
const usePaymentGatewaysMock = jest.fn();
const payExtraPagesMock = jest.fn();
const payReprintMock = jest.fn();
const verifyPaymentMock = jest.fn();
const useOnlineStatusMock = jest.fn();
const toastSuccessMock = jest.fn();
const routerReplaceMock = jest.fn();
let currentBookId: string | null = null;
let currentSearchParams = new Map<string, string>();

const TRANSLATIONS: Record<string, string> = {
  my_books: "My Books",
  book_progress_title: "My Books",
  book_progress_subtitle: "Track your book from payment to delivery.",
  book_progress_aria: "Book production progress tracker",
  book_progress_loading_title: "Loading book progress...",
  book_progress_loading_description: "Fetching the latest production updates.",
  book_progress_error_title: "Unable to load book progress",
  book_progress_error_description:
    "We couldn't load your book progress right now. Please try again.",
  book_progress_retry: "Retry",
  retry: "Try Again",
  book_progress_empty_title: "Select a book to view progress",
  book_progress_empty_description:
    "Choose an order with a linked book to see its production pipeline.",
  book_progress_empty_cta: "Go to Orders",
  book_progress_current_stage: "Current stage: {stage}",
  book_progress_rejection_reason_label: "Rejection reason",
  book_progress_meta_value_unavailable: "Unavailable",
  book_progress_meta_state_pending: "Pending",
  book_progress_meta_state_processing: "Processing",
  book_progress_meta_state_ready: "Ready",
  book_progress_meta_state_action_required: "Action Required",
  book_progress_state_completed: "Completed",
  book_progress_state_current: "Current",
  book_progress_state_upcoming: "Upcoming",
  book_progress_state_rejected: "Rejected",
  book_progress_stage_payment_received: "Payment Received",
  book_progress_stage_designing: "Designing",
  book_progress_stage_designed: "Designed",
  book_progress_stage_formatting: "Formatting",
  book_progress_stage_formatted: "Formatted",
  book_progress_stage_review: "Review",
  book_progress_stage_approved: "Approved",
  book_progress_stage_printing: "Printing",
  book_progress_stage_printed: "Printed",
  book_progress_stage_shipping: "Shipping",
  book_progress_stage_delivered: "Delivered",
  book_progress_cta_open_workspace: "Open Book",
  book_progress_cta_review_preview: "Review Preview",
  book_progress_cta_review_preview_loading: "Opening Preview...",
  book_progress_cta_view_files: "View File Versions",
  book_progress_cta_hide_files: "Hide File Versions",
  book_progress_preview_error: "Unable to load preview right now.",
  book_progress_browser_preview_title: "Browser Preview",
  book_progress_browser_preview_heading: "Live layout preview",
  book_progress_browser_preview_subtitle:
    "Preview your formatted manuscript in the browser and change layout settings before approval.",
  book_progress_browser_preview_settings_title: "Preview layout controls",
  book_progress_browser_preview_settings_hint:
    "Changing size or font automatically reruns AI formatting and server counting.",
  book_progress_browser_preview_settings_locked: "Layout settings are locked after approval.",
  book_progress_browser_preview_processing: "Processing manuscript",
  book_progress_browser_preview_reprocessing: "Reprocessing layout",
  book_progress_browser_preview_processing_note:
    "Approval stays locked until the first browser preview and server count are ready.",
  book_progress_browser_preview_reprocessing_note:
    "Approval stays locked until the new browser preview and server count are ready.",
  book_progress_browser_preview_delayed_notice:
    "This run is taking longer than expected. You can leave this page while we continue processing in the background.",
  book_progress_browser_preview_retry_cta: "Retry processing",
  book_progress_browser_preview_retry_loading: "Retrying...",
  book_progress_browser_preview_retry_error: "Unable to retry manuscript processing right now.",
  book_progress_browser_preview_failed_title: "Formatting needs attention",
  book_progress_browser_preview_failed_body:
    "Automated formatting stopped before the preview was generated. Retry processing to start a fresh AI run.",
  book_progress_browser_preview_background_notice:
    "You can leave this page while we keep processing your manuscript in the background.",
  book_progress_browser_preview_status_queued: "Queued",
  book_progress_browser_preview_status_processing: "Processing",
  book_progress_browser_preview_elapsed: "Elapsed {duration}",
  book_progress_browser_preview_attempt: "Attempt {attempt} of {maxAttempts}",
  book_progress_browser_preview_ready_toast: "Your updated preview and page count are ready.",
  book_progress_browser_preview_step_saving_settings: "Saving layout settings",
  book_progress_browser_preview_step_ai_formatting: "Formatting manuscript with AI",
  book_progress_browser_preview_step_counting_pages: "Counting authoritative pages",
  book_progress_browser_preview_step_rendering_preview: "Refreshing browser preview",
  book_progress_browser_preview_step_complete: "Completed",
  book_progress_browser_preview_step_upcoming: "Waiting",
  book_progress_browser_preview_saving_settings_message_primary:
    "Saving your new page and font settings.",
  book_progress_browser_preview_saving_settings_message_secondary:
    "Preparing a fresh formatting job with the updated layout rules.",
  book_progress_browser_preview_ai_formatting_message_primary:
    "Cleaning and formatting your manuscript with AI.",
  book_progress_browser_preview_ai_formatting_message_secondary:
    "Applying your selected trim size and font settings to the manuscript.",
  book_progress_browser_preview_counting_pages_message_primary:
    "Rendering the server layout for the billing-authoritative count.",
  book_progress_browser_preview_counting_pages_message_secondary:
    "Checking the final page total against your package limit.",
  book_progress_browser_preview_rendering_preview_message_primary:
    "Refreshing the latest preview and workspace state.",
  book_progress_browser_preview_rendering_preview_message_secondary:
    "Approval will unlock again as soon as the fresh preview is ready.",
  book_progress_browser_preview_count_pending:
    "The updated preview is ready. The authoritative server count is still running, so approval remains locked.",
  book_progress_browser_preview_note:
    "This browser preview is for review only. Billing uses the server-side count, not this view.",
  book_progress_browser_preview_latest_count: "Latest authoritative count: {count} pages",
  book_progress_browser_preview_empty_title: "Preview unlocks after upload",
  book_progress_browser_preview_empty_body:
    "Upload and process your manuscript to see the browser preview and adjust layout settings.",
  book_progress_browser_preview_unavailable:
    "Preview will appear here once formatted HTML is available.",
  book_progress_browser_preview_error: "Unable to load browser preview right now.",
  book_progress_browser_preview_settings_error: "Unable to update preview settings right now.",
  book_progress_browser_preview_frame_title: "Browser manuscript preview",
  manuscript_upload_book_title_label: "Book title",
  manuscript_upload_book_title_hint:
    "Add the title you want us to use across your dashboard and reviews.",
  manuscript_upload_book_title_placeholder: "Enter your book title",
  manuscript_upload_error_title_required: "Please add your book title.",
  manuscript_upload_book_size_a4: "A4",
  manuscript_upload_book_size_a4_desc: "Standard trim with more words per page.",
  manuscript_upload_book_size_a5: "A5",
  manuscript_upload_book_size_a5_desc: "Compact trim with fewer words per page.",
  manuscript_upload_font_size_value: "{size}pt",
  book_progress_files_title: "Book Files",
  book_progress_files_heading: "Version history and exports",
  book_progress_files_description:
    "Original uploads, formatted outputs, preview PDFs, and final files are listed here when available.",
  book_progress_files_empty: "No file versions are available for this book yet.",
  book_progress_files_error: "Unable to load book files right now.",
  book_progress_files_version: "Version {version}",
  book_progress_files_uploaded: "Uploaded {date}",
  book_progress_files_size: "Size {size}",
  book_progress_files_download: "Download",
  book_progress_workspace_title: "Book Workspace",
  book_progress_workspace_badge_processing: "Processing",
  book_progress_workspace_badge_blocked: "Blocked",
  book_progress_workspace_badge_action_required: "Action Required",
  book_progress_workspace_badge_payment_pending: "Payment Pending",
  book_progress_workspace_badge_unlocked: "Unlocked",
  book_progress_workspace_badge_approved: "Approved",
  book_progress_workspace_heading_processing: "Formatting and billing validation in progress",
  book_progress_workspace_heading_blocked: "Extra-page payment required",
  book_progress_workspace_heading_action_required: "Formatting needs attention",
  book_progress_workspace_heading_payment_pending: "Waiting for payment confirmation",
  book_progress_workspace_heading_unlocked: "Approval is unlocked",
  book_progress_workspace_heading_approved: "Approved for production",
  book_progress_workspace_desc_processing:
    "Your estimated pages are available now, but they are only a guide. We are still rendering the AI-formatted manuscript on the server to produce the final billing count.",
  book_progress_workspace_desc_blocked:
    "The final formatted manuscript is over your package limit. Approval stays locked until the extra-page balance is paid.",
  book_progress_workspace_desc_action_required:
    "Automated formatting stopped before the authoritative preview was generated. Retry processing to continue from the uploaded manuscript.",
  book_progress_workspace_desc_payment_pending:
    "An extra-page payment has been started. Approval remains locked until the payment webhook confirms the charge.",
  book_progress_workspace_desc_unlocked:
    "The authoritative page count is complete and no extra payment is blocking approval. Review the preview and approve when ready.",
  book_progress_workspace_desc_approved:
    "This book has been approved. Final PDF generation will continue automatically and the finished file will appear here once ready.",
  book_progress_workspace_estimated_pages: "Estimated Pages Before Formatting",
  book_progress_workspace_estimated_helper: "Guide only from word count, trim size, and font size.",
  book_progress_workspace_authoritative_pages: "Final Pages After Formatting",
  book_progress_workspace_formatting_delta: "Formatting Delta",
  book_progress_workspace_overage_pages: "Overage Pages",
  book_progress_workspace_authoritative_helper:
    "Used for extra-page checks, billing, and approval gating.",
  book_progress_workspace_authoritative_pending:
    "Server render is still running to produce the final billing count.",
  book_progress_workspace_delta_pending: "Delta appears after the server count finishes.",
  book_progress_workspace_delta_helper:
    "Difference between upload estimate and final formatted count.",
  book_progress_workspace_overage_pending:
    "Overage is calculated after the authoritative count returns.",
  book_progress_workspace_overage_helper: "Pages above your package limit.",
  book_progress_workspace_overage_clear: "No extra-page charge is required.",
  book_progress_workspace_value_pending: "Pending",
  book_progress_billing_gate_title: "Billing Gate",
  book_progress_billing_gate_processing: "Processing",
  book_progress_billing_gate_pending:
    "Server page count is still running. Approval stays locked until billing is resolved.",
  book_progress_billing_gate_action_required:
    "Formatting needs attention before the billing gate can continue. Retry manuscript processing to generate a fresh preview and server count.",
  book_progress_billing_gate_ready:
    "Your preview is ready. You can approve this book for final PDF generation.",
  book_progress_billing_gate_payment_required:
    "This manuscript exceeds your package limit. Extra-page payment is required before approval.",
  book_progress_billing_gate_payment_pending:
    "Payment has been started for the extra pages. Approval stays locked until confirmation is received.",
  book_progress_billing_gate_paid: "Extra-page payment is complete. You can approve the book now.",
  book_progress_billing_gate_approved: "This book has already been approved for production.",
  book_progress_billing_gate_page_count: "Authoritative Page Count",
  book_progress_billing_gate_extra_pages: "Extra Pages",
  book_progress_billing_gate_extra_amount: "Extra Amount Due",
  book_progress_billing_gate_pay_cta: "Pay Extra Pages",
  book_progress_billing_gate_pay_loading: "Opening Payment...",
  book_progress_billing_gate_approve_cta: "Approve for Production",
  book_progress_billing_gate_approve_loading: "Approving...",
  book_progress_billing_gate_success: "Book approved. Final PDF generation has been queued.",
  book_progress_billing_gate_payment_redirect: "Redirecting to payment...",
  book_progress_billing_gate_provider_unavailable:
    "No online payment gateway is available right now.",
  book_progress_billing_gate_payment_error: "Unable to start extra-page payment right now.",
  offline_banner: "You're offline — some features require an internet connection",
  book_progress_rollout_title: "Release Control",
  book_progress_rollout_heading: "This automated step is not enabled here yet",
  book_progress_rollout_workspace_disabled:
    "The manuscript workspace is disabled for this environment. This book stays on the manual fallback path until rollout is enabled.",
  book_progress_rollout_pipeline_disabled:
    "Automated manuscript processing is disabled for this environment. This book stays on the manual fallback path until rollout is enabled.",
  book_progress_rollout_billing_disabled:
    "Automated extra-page billing is disabled for this environment. Approval stays on the fallback path until rollout is enabled.",
  book_progress_rollout_final_pdf_disabled:
    "Automated final PDF generation is disabled for this environment. Approval stays on the fallback path until rollout is enabled.",
  book_progress_rollout_grandfathered_title: "Release Control",
  book_progress_rollout_grandfathered_heading: "This book can finish on the current rollout",
  book_progress_rollout_grandfathered:
    "This manuscript started before the current rollout limit changed, so it can continue through the automated path without interruption.",
  book_progress_rollout_environment: "Environment: {environment}",
  reprint_same: "Reprint Same",
  revise_reprint: "Revise & Reprint",
  loading: "Loading...",
  reprint_same_modal_title: "Reprint with the same final PDF",
  reprint_same_modal_description:
    "Reuse your delivered final PDF, adjust the print settings, and review the live reprint price before payment.",
  reprint_same_close_aria: "Close reprint modal",
  reprint_same_load_error_description:
    "We couldn't load this reprint configuration right now. Try again in a moment.",
  reprint_same_unavailable_inline_final_pdf:
    "Same-file reprint is disabled because the final PDF is not available yet.",
  reprint_same_unavailable_inline_generic:
    "Same-file reprint is currently unavailable for this book.",
  reprint_same_contact_support: "Contact support",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations:
    (_namespace: "dashboard" | "common") => (key: string, values?: Record<string, unknown>) => {
      const template = TRANSLATIONS[key] ?? key;
      return interpolate(template, values);
    },
  useLocale: () => "en",
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "bookId") return currentBookId;
      return currentSearchParams.get(key) ?? null;
    },
    toString: () => new URLSearchParams(Array.from(currentSearchParams.entries())).toString(),
  }),
}));

jest.mock("@/hooks/useBookProgress", () => ({
  useBookProgress: (...args: unknown[]) => useBookProgressMock(...args),
  approveBookForProduction: (...args: unknown[]) => approveBookForProductionMock(...args),
  reprocessBookManuscript: (...args: unknown[]) => reprocessBookManuscriptMock(...args),
}));

jest.mock("@/hooks/useBookResources", () => ({
  useBookPreview: (...args: unknown[]) => useBookPreviewMock(...args),
  useBookFiles: (...args: unknown[]) => useBookFilesMock(...args),
}));

jest.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

jest.mock("@/hooks/use-book-reprint-config", () => ({
  useBookReprintConfig: (...args: unknown[]) => useBookReprintConfigMock(...args),
}));

jest.mock("@/hooks/useOrderDetail", () => ({
  useOrderDetail: (...args: unknown[]) => useOrderDetailMock(...args),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: (...args: unknown[]) => useOrdersMock(...args),
}));

jest.mock("@/hooks/usePayments", () => ({
  usePaymentGateways: (...args: unknown[]) => usePaymentGatewaysMock(...args),
  payExtraPages: (...args: unknown[]) => payExtraPagesMock(...args),
  payReprint: (...args: unknown[]) => payReprintMock(...args),
  verifyPayment: (...args: unknown[]) => verifyPaymentMock(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

jest.mock("@/components/dashboard/book-progress-tracker", () => ({
  BookProgressTracker: ({
    currentStage,
    ariaLabel,
    className,
  }: {
    currentStage: string;
    ariaLabel?: string;
    className?: string;
  }) => (
    <section data-testid="book-progress-tracker" aria-label={ariaLabel} className={className}>
      {currentStage}
    </section>
  ),
}));

jest.mock("@/components/dashboard/manuscript-upload-flow", () => ({
  ManuscriptUploadFlow: () => <section data-testid="manuscript-upload-flow" />,
}));

jest.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div data-slot="collapsible" {...props}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <button data-slot="collapsible-trigger" type="button" {...props}>
      {children}
    </button>
  ),
  CollapsibleContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div data-slot="collapsible-content" {...props}>
      {children}
    </div>
  ),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
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
  usePathname: () => "/dashboard/books",
  useRouter: () => ({
    replace: (...args: unknown[]) => routerReplaceMock(...args),
  }),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

function installMatchMediaMock() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width") ? window.innerWidth < 768 : false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

function createRolloutState(overrides: Record<string, unknown> = {}) {
  return {
    environment: "staging",
    allowInFlightAccess: true,
    isGrandfathered: false,
    blockedBy: null,
    workspace: { enabled: true, access: "enabled" },
    manuscriptPipeline: { enabled: true, access: "enabled" },
    billingGate: { enabled: true, access: "enabled" },
    finalPdf: { enabled: true, access: "enabled" },
    ...overrides,
  };
}

function createProcessingState(overrides: Record<string, unknown> = {}) {
  return {
    isActive: false,
    currentStep: null,
    jobStatus: null,
    trigger: null,
    startedAt: null,
    attempt: null,
    maxAttempts: null,
    ...overrides,
  };
}

function createBookProgressData(overrides: Record<string, unknown> = {}) {
  return {
    sourceEndpoint: "books_detail",
    bookId: currentBookId,
    orderId: null,
    currentStatus: null,
    productionStatus: "PAYMENT_RECEIVED",
    latestProcessingError: null,
    rejectionReason: null,
    currentStage: "PAYMENT_RECEIVED",
    isRejected: false,
    timeline: [],
    title: null,
    coverImageUrl: null,
    pageCount: null,
    wordCount: null,
    estimatedPages: null,
    documentPageCount: null,
    fontFamily: null,
    fontSize: null,
    pageSize: null,
    currentHtmlUrl: null,
    previewPdfUrl: null,
    finalPdfUrl: null,
    updatedAt: null,
    rollout: createRolloutState(),
    processing: createProcessingState(),
    ...overrides,
  };
}

describe("BooksView route integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentBookId = "cm1111111111111111111111111";
    currentSearchParams = new Map();
    setViewportWidth(1280);
    installMatchMediaMock();
    toastSuccessMock.mockReset();
    routerReplaceMock.mockReset();
    approveBookForProductionMock.mockResolvedValue({
      bookId: "cm1111111111111111111111111",
      bookStatus: "APPROVED",
      orderStatus: "APPROVED",
      queuedJob: {
        queue: "pdf-generation",
        name: "generate-pdf",
        jobId: "job_123",
      },
    });
    reprocessBookManuscriptMock.mockResolvedValue({
      bookId: "cm1111111111111111111111111",
      bookStatus: "AI_PROCESSING",
      orderStatus: "FORMATTING",
      queuedJob: {
        queue: "ai-formatting",
        name: "format-manuscript",
        jobId: "job_retry_123",
      },
    });
    useOrdersMock.mockReturnValue({
      items: [],
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    useBookPreviewMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn().mockResolvedValue({
        data: {
          bookId: currentBookId ?? "cm1111111111111111111111111",
          previewPdfUrl: "https://example.com/preview.pdf",
          status: "PREVIEW_READY",
          watermarked: true,
        },
        error: null,
      }),
    });
    useBookFilesMock.mockImplementation(
      ({ bookId, enabled }: { bookId?: string | null; enabled?: boolean }) => ({
        data: {
          bookId: bookId ?? "",
          files: enabled
            ? [
                {
                  id: "file_1",
                  fileType: "PREVIEW_PDF",
                  url: "https://example.com/preview.pdf",
                  fileName: "preview.pdf",
                  fileSize: 120000,
                  version: 2,
                  createdAt: "2026-03-02T10:00:00.000Z",
                },
              ]
            : [],
        },
        isFetching: false,
        isError: false,
        error: null,
      })
    );
    useBookReprintConfigMock.mockReturnValue({
      config: {
        bookId: currentBookId ?? "cm1111111111111111111111111",
        canReprintSame: true,
        disableReason: null,
        finalPdfUrlPresent: true,
        pageCount: 128,
        minCopies: 25,
        defaultBookSize: "A5",
        defaultPaperColor: "white",
        defaultLamination: "gloss",
        allowedBookSizes: ["A4", "A5", "A6"],
        allowedPaperColors: ["white", "cream"],
        allowedLaminations: ["matt", "gloss"],
        costPerPageBySize: {
          A4: 20,
          A5: 10,
          A6: 5,
        },
        enabledPaymentProviders: ["PAYSTACK", "STRIPE"],
      },
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: null,
        extraAmount: null,
        latestExtraPaymentStatus: null,
        latestPaymentProvider: null,
        latestPaymentReference: null,
      },
      status: null,
      extraAmount: null,
      latestExtraPaymentStatus: null,
      latestPaymentProvider: null,
      latestPaymentReference: null,
      isInitialLoading: false,
      refetch: jest.fn(),
    });
    usePaymentGatewaysMock.mockReturnValue({
      data: [
        {
          id: "gateway_1",
          provider: "PAYSTACK",
          name: "Paystack",
          isEnabled: true,
          isTestMode: false,
          bankDetails: null,
          instructions: null,
          priority: 0,
        },
      ],
      isLoading: false,
    });
    payExtraPagesMock.mockResolvedValue({
      authorizationUrl: "https://example.com/pay",
      reference: "ref_123",
      provider: "PAYSTACK",
    });
    payReprintMock.mockResolvedValue({
      authorizationUrl: "https://example.com/reprint-pay",
      reference: "rp_ref_123",
      provider: "PAYSTACK",
    });
    verifyPaymentMock.mockResolvedValue({
      status: "pending",
      reference: "ref_123",
      amount: 180,
      currency: "NGN",
      verified: false,
      awaitingWebhook: true,
      email: null,
      orderNumber: null,
      packageName: null,
      amountPaid: null,
      addons: [],
    });
    useOnlineStatusMock.mockReturnValue(true);
  });

  it("shows empty state when no bookId query param is provided", () => {
    currentBookId = null;
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData(),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<BooksView />);

    expect(screen.getByText("Select a book to view progress")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Go to Orders" });
    expect(cta).toHaveAttribute("href", "/dashboard/orders");
  });

  it("supports keyboard focus navigation to empty-state CTA", async () => {
    const user = userEvent.setup();

    currentBookId = null;
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData(),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<BooksView />);
    const cta = screen.getByRole("link", { name: "Go to Orders" });
    await user.tab();
    expect(cta).toHaveFocus();
  });

  it("auto-resolves linked book from orders when query param is missing", () => {
    const linkedBookId = "cm3333333333333333333333333";

    currentBookId = null;
    useOrdersMock.mockReturnValue({
      items: [
        {
          id: "ord_1",
          bookId: linkedBookId,
        },
      ],
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        currentStage: "PRINTING",
        timeline: [
          {
            stage: "PRINTING",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PRINTING",
          },
        ],
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<BooksView />);

    expect(useBookProgressMock).toHaveBeenCalledWith({
      bookId: linkedBookId,
      enabled: true,
    });
    expect(screen.getByText("Current stage: Printing")).toBeInTheDocument();
  });

  it("shows loading skeleton when initial fetch is pending", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData(),
      isInitialLoading: true,
      isError: false,
      isFetching: true,
      refetch: jest.fn(),
      error: null,
    });

    const { container } = render(<BooksView />);

    expect(screen.getByText("Loading book progress...")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows error state and retries on keyboard activation", async () => {
    const refetch = jest.fn();
    const user = userEvent.setup();

    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData(),
      isInitialLoading: false,
      isError: true,
      isFetching: false,
      refetch,
      error: new Error("Book not found"),
    });

    render(<BooksView />);

    expect(screen.getByText("Unable to load book progress")).toBeInTheDocument();
    expect(screen.getByText("Book not found")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Try Again" });
    retryButton.focus();
    await user.keyboard("{Enter}");
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders tracker with translated current stage summary", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        currentStage: "PRINTING",
        timeline: [
          {
            stage: "PRINTING",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PRINTING",
          },
        ],
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<BooksView />);

    expect(screen.getByText("Current stage: Printing")).toBeInTheDocument();
    expect(screen.getByLabelText("Book production progress tracker")).toBeInTheDocument();
    expect(screen.getByText("My Books")).toHaveClass("text-white");
    expect(screen.getByText("Track your book from payment to delivery.")).toHaveClass(
      "text-[#d0d0d0]"
    );
    expect(screen.getByTestId("book-progress-tracker")).toHaveTextContent("PRINTING");
  });

  it.each([
    375, 768, 1280,
  ])("renders stably at requested viewport width %ipx with ARIA and no horizontal overflow containers", (width) => {
    setViewportWidth(width);
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        currentStage: "PRINTING",
        timeline: [
          {
            stage: "PRINTING",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PRINTING",
          },
        ],
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    const { container, unmount } = render(<BooksView />);
    expect(container.querySelector("section.min-w-0")).toBeInTheDocument();
    expect(screen.getByLabelText("Book production progress tracker")).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).not.toBeInTheDocument();
    unmount();
  });

  it("shows billing-gate payment action when extra-page payment is required", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        rejectionReason: null,
        estimatedPages: 132,
        pageCount: 142,
        wordCount: 41000,
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PENDING_EXTRA_PAYMENT",
        extraAmount: 200,
        latestExtraPaymentStatus: null,
      },
      status: "PENDING_EXTRA_PAYMENT",
      extraAmount: 200,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.getAllByText("Book Workspace").length).toBeGreaterThan(0);
    expect(screen.getByText("Extra-page payment required")).toBeInTheDocument();
    expect(screen.getByText("Estimated Pages Before Formatting")).toBeInTheDocument();
    expect(screen.getByText("Final Pages After Formatting")).toBeInTheDocument();
    expect(screen.getByText("Formatting Delta")).toBeInTheDocument();
    expect(screen.getByText("Overage Pages")).toBeInTheDocument();
    expect(
      screen.getByText("Guide only from word count, trim size, and font size.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Used for extra-page checks, billing, and approval gating.")
    ).toBeInTheDocument();
    expect(screen.getByText("Billing Gate")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This manuscript exceeds your package limit. Extra-page payment is required before approval."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay Extra Pages" })).toBeInTheDocument();
  });

  it("disables extra-page payment offline", async () => {
    const user = userEvent.setup();
    useOnlineStatusMock.mockReturnValue(false);
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        estimatedPages: 132,
        pageCount: 142,
        wordCount: 41000,
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PENDING_EXTRA_PAYMENT",
        extraAmount: 200,
        latestExtraPaymentStatus: null,
      },
      status: "PENDING_EXTRA_PAYMENT",
      extraAmount: 200,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    const payButton = screen.getByRole("button", { name: "Pay Extra Pages" });

    expect(payButton).toBeDisabled();
    expect(
      screen.getByText("You're offline — some features require an internet connection")
    ).toBeInTheDocument();

    await user.click(payButton);

    expect(payExtraPagesMock).not.toHaveBeenCalled();
  });

  it("renders the production progress block between manuscript upload and book workspace", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        estimatedPages: 132,
        pageCount: 142,
        wordCount: 41000,
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PENDING_EXTRA_PAYMENT",
        extraAmount: 200,
        latestExtraPaymentStatus: null,
      },
      status: "PENDING_EXTRA_PAYMENT",
      extraAmount: 200,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    const uploadFlow = screen.getByTestId("manuscript-upload-flow");
    const progressTracker = screen.getByTestId("book-progress-tracker");
    const workspaceHeading = screen.getAllByText("Book Workspace")[0];

    expect(
      uploadFlow.compareDocumentPosition(progressTracker) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      progressTracker.compareDocumentPosition(workspaceHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows action-required workspace copy when formatting stops before preview generation", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "FORMATTING_REVIEW",
        latestProcessingError:
          'Gemini request failed (429): {"error":{"message":"Rate limit exceeded"}}',
        estimatedPages: 73,
        wordCount: 18_534,
        pageCount: null,
        pageSize: "A5",
        fontSize: 11,
        currentHtmlUrl: null,
        previewPdfUrl: null,
        processing: createProcessingState(),
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "ACTION_REQUIRED",
        extraAmount: 0,
        latestExtraPaymentStatus: null,
      },
      status: "ACTION_REQUIRED",
      extraAmount: 0,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.getAllByText("Formatting needs attention").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Automated formatting stopped before the authoritative preview was generated. Retry processing to continue from the uploaded manuscript."
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Gemini request failed (429): {"error":{"message":"Rate limit exceeded"}}'
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Formatting needs attention before the billing gate can continue. Retry manuscript processing to generate a fresh preview and server count."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Formatting and billing validation in progress")
    ).not.toBeInTheDocument();
  });

  it("calls the approve endpoint when preview is ready", async () => {
    const user = userEvent.setup();
    const refetch = jest.fn();
    const refetchOrderDetail = jest.fn();

    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        rejectionReason: null,
        estimatedPages: 124,
        pageCount: 128,
        wordCount: 37000,
        currentHtmlUrl: "https://example.com/current.html",
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch,
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PREVIEW_READY",
        extraAmount: 0,
        latestExtraPaymentStatus: null,
      },
      status: "PREVIEW_READY",
      extraAmount: 0,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: refetchOrderDetail,
    });

    render(<BooksView />);

    expect(screen.getByText("Approval is unlocked")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve for Production" }));

    await waitFor(() =>
      expect(approveBookForProductionMock).toHaveBeenCalledWith({
        bookId: "cm1111111111111111111111111",
      })
    );
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refetchOrderDetail).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText("Book approved. Final PDF generation has been queued.")
    ).toBeInTheDocument();
  });

  it("loads preview lazily from the canonical preview endpoint", async () => {
    const user = userEvent.setup();
    const previewRefetch = jest.fn().mockResolvedValue({
      data: {
        bookId: "cm1111111111111111111111111",
        previewPdfUrl: "https://example.com/preview-lazy.pdf",
        status: "PREVIEW_READY",
        watermarked: true,
      },
      error: null,
    });
    const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        rejectionReason: null,
        estimatedPages: 124,
        pageCount: 128,
        wordCount: 37000,
        currentHtmlUrl: "https://example.com/current.html",
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useBookPreviewMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: false,
      error: null,
      refetch: previewRefetch,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PREVIEW_READY",
        extraAmount: 0,
        latestExtraPaymentStatus: null,
      },
      status: "PREVIEW_READY",
      extraAmount: 0,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    await user.click(screen.getByRole("button", { name: "Review Preview" }));

    await waitFor(() => expect(previewRefetch).toHaveBeenCalledTimes(1));
    expect(windowOpenSpy).toHaveBeenCalledWith(
      "https://example.com/preview-lazy.pdf",
      "_blank",
      "noopener,noreferrer"
    );

    windowOpenSpy.mockRestore();
  });

  it("retries stale manuscript processing from the preview workspace", async () => {
    const user = userEvent.setup();
    const refetch = jest.fn().mockResolvedValue(undefined);
    const refetchOrderDetail = jest.fn().mockResolvedValue(undefined);

    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "FORMATTING_REVIEW",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "FORMATTING_REVIEW",
          },
        ],
        rejectionReason: null,
        estimatedPages: 124,
        pageCount: null,
        wordCount: 37000,
        pageSize: "A5",
        fontSize: 12,
        currentHtmlUrl: null,
        previewPdfUrl: null,
        latestProcessingError: "AI formatting failed after 3 retries",
        processing: createProcessingState({
          isActive: false,
          currentStep: null,
          jobStatus: null,
          trigger: null,
          startedAt: null,
        }),
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch,
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "ACTION_REQUIRED",
        extraAmount: 0,
        latestExtraPaymentStatus: null,
      },
      status: "ACTION_REQUIRED",
      extraAmount: 0,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: refetchOrderDetail,
    });

    render(<BooksView />);

    await user.click(screen.getByRole("button", { name: "Retry processing" }));

    await waitFor(() =>
      expect(reprocessBookManuscriptMock).toHaveBeenCalledWith("cm1111111111111111111111111")
    );
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    await waitFor(() => expect(refetchOrderDetail).toHaveBeenCalled());
  });

  it("keeps approval locked until the order billing state has loaded", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        rejectionReason: null,
        estimatedPages: 124,
        pageCount: 128,
        wordCount: 37000,
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: null,
        extraAmount: null,
        latestExtraPaymentStatus: null,
      },
      status: null,
      extraAmount: null,
      latestExtraPaymentStatus: null,
      isInitialLoading: true,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(
      screen.getByText(
        "Server page count is still running. Approval stays locked until billing is resolved."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve for Production" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Extra Amount Due")).not.toBeInTheDocument();
  });

  it("shows payment-pending state after extra-page payment has started", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        rejectionReason: null,
        estimatedPages: 132,
        pageCount: 142,
        wordCount: 41000,
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PENDING_EXTRA_PAYMENT",
        extraAmount: 200,
        latestExtraPaymentStatus: "PENDING",
      },
      status: "PENDING_EXTRA_PAYMENT",
      extraAmount: 200,
      latestExtraPaymentStatus: "PENDING",
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.getByText("Waiting for payment confirmation")).toBeInTheDocument();
    expect(
      screen.getByText(
        "An extra-page payment has been started. Approval remains locked until the payment webhook confirms the charge."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Payment has been started for the extra pages. Approval stays locked until confirmation is received."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay Extra Pages" })).toBeInTheDocument();
  });

  it("verifies a returned extra-page payment reference and refetches the workspace", async () => {
    currentBookId = "cm1111111111111111111111111";
    currentSearchParams = new Map([["reference", "ep_ref_return"]]);
    const refetchBookMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const refetchOrderMock = jest.fn().mockResolvedValue({ data: null, error: null });

    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        estimatedPages: 110,
        pageCount: 118,
        wordCount: 36000,
        previewPdfUrl: "https://example.com/preview.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: refetchBookMock,
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PENDING_EXTRA_PAYMENT",
        extraAmount: 180,
        latestExtraPaymentStatus: "PENDING",
        latestPaymentProvider: "PAYSTACK",
        latestPaymentReference: "ep_ref_return",
      },
      status: "PENDING_EXTRA_PAYMENT",
      extraAmount: 180,
      latestExtraPaymentStatus: "PENDING",
      latestPaymentProvider: "PAYSTACK",
      latestPaymentReference: "ep_ref_return",
      isInitialLoading: false,
      refetch: refetchOrderMock,
    });
    verifyPaymentMock.mockResolvedValue({
      status: "success",
      reference: "ep_ref_return",
      amount: 180,
      currency: "NGN",
      verified: true,
      awaitingWebhook: false,
      email: null,
      orderNumber: null,
      packageName: null,
      amountPaid: null,
      addons: [],
    });

    render(<BooksView />);

    await waitFor(() => {
      expect(verifyPaymentMock).toHaveBeenCalledWith("ep_ref_return", "PAYSTACK");
    });
    await waitFor(() => {
      expect(refetchBookMock).toHaveBeenCalled();
      expect(refetchOrderMock).toHaveBeenCalled();
    });
  });

  it("shows approved workspace actions when the final PDF is available", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "APPROVED",
        currentStatus: "APPROVED",
        timeline: [
          {
            stage: "APPROVED",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "APPROVED",
          },
        ],
        rejectionReason: null,
        estimatedPages: 120,
        pageCount: 128,
        wordCount: 37000,
        previewPdfUrl: "https://example.com/preview.pdf",
        finalPdfUrl: "https://example.com/final.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "APPROVED",
        extraAmount: 0,
        latestExtraPaymentStatus: "SUCCESS",
      },
      status: "APPROVED",
      extraAmount: 0,
      latestExtraPaymentStatus: "SUCCESS",
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.getByText("Approved for production")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download Final PDF" })).not.toBeInTheDocument();
  });

  it.each([
    "DELIVERED",
    "COMPLETED",
  ] as const)("shows reprint actions for %s books in the workspace action row", (bookStatus) => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "DELIVERED",
        currentStatus: bookStatus,
        timeline: [
          {
            stage: "DELIVERED",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: bookStatus,
          },
        ],
        pageCount: 128,
        wordCount: 37000,
        previewPdfUrl: "https://example.com/preview.pdf",
        finalPdfUrl: "https://example.com/final.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: bookStatus,
        extraAmount: 0,
        latestExtraPaymentStatus: "SUCCESS",
      },
      status: bookStatus,
      extraAmount: 0,
      latestExtraPaymentStatus: "SUCCESS",
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.getByRole("button", { name: "Reprint Same" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Revise & Reprint" })).toHaveAttribute(
      "href",
      `/pricing?orderType=REPRINT_REVISED&sourceBookId=${currentBookId}`
    );
  });

  it("hides reprint actions for books that are not delivered or completed", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "SHIPPING",
        currentStatus: "SHIPPING",
        timeline: [
          {
            stage: "SHIPPING",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "SHIPPING",
          },
        ],
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "SHIPPING",
        extraAmount: 0,
        latestExtraPaymentStatus: "SUCCESS",
      },
      status: "SHIPPING",
      extraAmount: 0,
      latestExtraPaymentStatus: "SUCCESS",
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.queryByRole("button", { name: "Reprint Same" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Revise & Reprint" })).not.toBeInTheDocument();
  });

  it("opens the reprint modal route state from the workspace action row", async () => {
    const user = userEvent.setup();

    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "DELIVERED",
        currentStatus: "DELIVERED",
        timeline: [
          {
            stage: "DELIVERED",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "DELIVERED",
          },
        ],
        pageCount: 128,
        wordCount: 37000,
        finalPdfUrl: "https://example.com/final.pdf",
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "DELIVERED",
        extraAmount: 0,
        latestExtraPaymentStatus: "SUCCESS",
      },
      status: "DELIVERED",
      extraAmount: 0,
      latestExtraPaymentStatus: "SUCCESS",
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    await user.click(screen.getByRole("button", { name: "Reprint Same" }));

    expect(routerReplaceMock).toHaveBeenCalledWith(
      `/dashboard/books?bookId=${currentBookId}&reprint=same`
    );
  });

  it("disables same-file reprint and shows the support message when the final PDF is missing", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookReprintConfigMock.mockReturnValue({
      config: {
        bookId: currentBookId,
        canReprintSame: false,
        disableReason: "FINAL_PDF_MISSING",
        finalPdfUrlPresent: false,
        pageCount: 128,
        minCopies: 25,
        defaultBookSize: "A5",
        defaultPaperColor: "white",
        defaultLamination: "gloss",
        allowedBookSizes: ["A4", "A5", "A6"],
        allowedPaperColors: ["white", "cream"],
        allowedLaminations: ["matt", "gloss"],
        costPerPageBySize: {
          A4: 20,
          A5: 10,
          A6: 5,
        },
        enabledPaymentProviders: ["PAYSTACK"],
      },
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "DELIVERED",
        currentStatus: "DELIVERED",
        timeline: [
          {
            stage: "DELIVERED",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "DELIVERED",
          },
        ],
        pageCount: 128,
        wordCount: 37000,
        finalPdfUrl: null,
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "DELIVERED",
        extraAmount: 0,
        latestExtraPaymentStatus: "SUCCESS",
      },
      status: "DELIVERED",
      extraAmount: 0,
      latestExtraPaymentStatus: "SUCCESS",
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.getByRole("button", { name: "Reprint Same" })).toBeDisabled();
    expect(
      screen.getByText("Same-file reprint is disabled because the final PDF is not available yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "/contact"
    );
  });

  it("shows rollout fallback when manuscript automation is disabled for a new book", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "PAYMENT_RECEIVED",
        currentStatus: "AWAITING_UPLOAD",
        pageSize: null,
        fontSize: null,
        rollout: createRolloutState({
          blockedBy: "manuscript_pipeline",
          manuscriptPipeline: { enabled: false, access: "disabled" },
        }),
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<BooksView />);

    expect(screen.getByText("This automated step is not enabled here yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Automated manuscript processing is disabled for this environment. This book stays on the manual fallback path until rollout is enabled."
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId("manuscript-upload-flow")).not.toBeInTheDocument();
  });

  it("shows a grandfathered notice while allowing in-flight books to continue", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: createBookProgressData({
        bookId: currentBookId,
        orderId: "ord_123",
        currentStage: "REVIEW",
        currentStatus: "PREVIEW_READY",
        timeline: [
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PREVIEW_READY",
          },
        ],
        estimatedPages: 124,
        pageCount: 128,
        wordCount: 37000,
        currentHtmlUrl: "https://example.com/current.html",
        previewPdfUrl: "https://example.com/preview.pdf",
        rollout: createRolloutState({
          isGrandfathered: true,
          blockedBy: "final_pdf",
          finalPdf: { enabled: false, access: "grandfathered" },
        }),
      }),
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });
    useOrderDetailMock.mockReturnValue({
      data: {
        status: "PREVIEW_READY",
        extraAmount: 0,
        latestExtraPaymentStatus: null,
      },
      status: "PREVIEW_READY",
      extraAmount: 0,
      latestExtraPaymentStatus: null,
      isInitialLoading: false,
      refetch: jest.fn(),
    });

    render(<BooksView />);

    expect(screen.getByText("This book can finish on the current rollout")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This manuscript started before the current rollout limit changed, so it can continue through the automated path without interruption."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve for Production" })).toBeInTheDocument();
  });
});
