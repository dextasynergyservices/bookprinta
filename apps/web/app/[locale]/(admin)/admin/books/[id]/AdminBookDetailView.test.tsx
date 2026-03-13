import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminBookConflictError } from "@/hooks/useAdminBookActions";
import { AdminBookDetailView } from "./AdminBookDetailView";

const useAdminBookDetailMock = jest.fn();
const useAdminBookStatusMutationMock = jest.fn();
const useAdminBookRejectMutationMock = jest.fn();
const useAdminBookHtmlUploadMutationMock = jest.fn();
const useAdminBookDownloadMutationMock = jest.fn();
const useAdminBookVersionFileDownloadMutationMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  books_back_to_list: "Back to Books",
  books_title_untitled: "Untitled book",
  books_table_author: "Author",
  books_table_order_ref: "Order Ref",
  orders_table_email: "Email",
  orders_table_status: "Status",
  orders_date_unavailable: "Date unavailable",
  orders_detail_unknown: "Unavailable",
  orders_detail_customer_language: "Preferred Language",
  orders_detail_book_version: "Book Version",
  orders_detail_meta_created: "Created",
  orders_detail_book_rejection: "Rejection Reason",
  books_detail_description:
    "Inspect manuscript metrics, verify generated files, and run the production workflow from one admin workspace.",
  books_detail_meta_uploaded: "Uploaded",
  books_detail_meta_updated: "Last Updated",
  books_detail_status_source_manuscript: "Status driven by manuscript workflow",
  books_detail_status_source_production: "Status driven by production workflow",
  books_detail_processing_active: "Processing is currently active",
  books_detail_processing_idle: "Idle",
  books_detail_processing_step: "Processing Step",
  books_detail_processing_trigger: "Processing Trigger",
  books_detail_processing_error: "Latest Processing Error",
  books_detail_metric_pages: "Page Count",
  books_detail_metric_pages_hint: "Authoritative pages from the current render.",
  books_detail_metric_words: "Word Count",
  books_detail_metric_words_hint: "Captured from the latest manuscript version.",
  books_detail_metric_size: "Book Size",
  books_detail_metric_size_hint: "The active layout size driving render output.",
  books_detail_metric_font: "Font Size",
  books_detail_metric_font_hint: "The chosen manuscript formatting size.",
  books_detail_metric_font_value: "{size} pt",
  books_detail_metric_unavailable: "Unavailable",
  books_detail_section_summary_eyebrow: "Summary",
  books_detail_section_summary: "Book Summary",
  books_detail_section_summary_description:
    "Author, order, and processing context for the current manuscript version.",
  books_detail_order_action: "Open Order",
  books_detail_section_files_eyebrow: "Files",
  books_detail_section_files: "File Lineage",
  books_detail_section_files_description:
    "Every tracked manuscript, HTML, and PDF version attached to this book.",
  books_detail_empty_files: "No files are attached to this book yet.",
  books_detail_file_versions: "{count} versions tracked",
  books_detail_file_version: "Version {version}",
  books_detail_file_created: "Created",
  books_detail_file_creator: "Created By",
  books_detail_file_mime: "MIME Type",
  books_detail_file_size: "File Size",
  books_detail_file_actions_open: "Download File",
  books_detail_file_actions_verify: "Verify PDF",
  books_detail_file_actions_hide_verifier: "Hide Verifier",
  books_detail_file_download_success: "File download started",
  books_detail_pdf_panel_eyebrow: "Verification",
  books_detail_pdf_panel_title: "PDF Verifier",
  books_detail_pdf_panel_description:
    "Review {fileName} directly in the admin workspace before moving the book forward.",
  books_detail_pdf_placeholder: "Select a PDF to verify",
  books_detail_pdf_placeholder_description:
    "Choose any preview, formatted, or final PDF version above to lazy-load the verifier.",
  books_detail_section_workflow_eyebrow: "Workflow",
  books_detail_section_workflow: "Workflow Actions",
  books_detail_section_workflow_description:
    "Advance status, reject a manuscript, upload HTML fallback, and download the protected source files.",
  books_detail_status_heading: "Advance Book Status",
  books_detail_status_next_label: "Next Status",
  books_detail_status_reason_label: "Reason",
  books_detail_status_reason_placeholder: "Explain why this book is moving to the next stage",
  books_detail_status_note_label: "Internal Note",
  books_detail_status_note_placeholder: "Optional admin note for the audit trail",
  books_detail_status_submit: "Advance Status",
  books_detail_status_submitting: "Updating status",
  books_detail_status_locked: "No further status transitions are available for this book.",
  books_detail_status_success: "Book status updated",
  books_detail_status_success_description:
    "The book moved to {status} and the audit log was recorded.",
  books_detail_status_error_title: "Unable to update book status",
  books_detail_status_error_description: "Refresh the book and try that status change again.",
  books_detail_conflict_title: "This book changed in another session",
  books_detail_conflict_description:
    "Another admin updated this book. Refresh the page to load the latest version before continuing.",
  books_detail_conflict_refresh: "Refresh Book",
  books_detail_reject_heading: "Reject Manuscript",
  books_detail_reject_description:
    "Return the manuscript to the author with a required rejection reason and notification.",
  books_detail_reject_locked: "This manuscript can no longer be rejected from its current stage.",
  books_detail_reject_button: "Reject Manuscript",
  books_detail_reject_modal_title: "Reject This Manuscript",
  books_detail_reject_modal_description:
    "This reason is required, emailed to the author, and saved to the in-app notification trail.",
  books_detail_reject_reason_label: "Rejection Reason",
  books_detail_reject_reason_placeholder:
    "Explain the revision issues the author must address before resubmitting",
  books_detail_reject_cancel: "Cancel",
  books_detail_reject_confirm: "Send Rejection",
  books_detail_reject_submitting: "Sending rejection",
  books_detail_reject_success: "Manuscript rejected",
  books_detail_reject_success_description:
    "The manuscript moved to {status} and the author was notified.",
  books_detail_reject_error_title: "Unable to reject manuscript",
  books_detail_reject_error_description: "Try again after refreshing the book details.",
  books_detail_upload_title: "HTML Fallback Upload",
  books_detail_upload_description:
    "Upload a cleaned HTML file manually when the AI formatting path needs admin intervention.",
  books_detail_upload_locked:
    "Manual HTML upload is unavailable for this book at its current stage.",
  books_detail_upload_action: "Upload Cleaned HTML",
  books_detail_upload_submitting: "Uploading HTML",
  books_detail_upload_progress_label: "HTML upload progress",
  books_detail_upload_success: "Cleaned HTML uploaded",
  books_detail_upload_success_description:
    "The cleaned HTML was stored and the downstream processing queue was resumed.",
  books_detail_upload_error_title: "Unable to upload cleaned HTML",
  books_detail_upload_error_description:
    "Try the HTML upload again after refreshing the book details.",
  books_detail_upload_validation_unsupported: "Choose an HTML file ending in .html or .htm.",
  books_detail_upload_validation_empty: "The selected HTML file is empty.",
  books_detail_upload_validation_size: "The selected HTML file must be 10MB or smaller.",
  books_detail_download_title: "Admin Downloads",
  books_detail_download_description:
    "Download the original manuscript, the current cleaned HTML, or the final clean PDF using the authenticated admin endpoints.",
  books_detail_download_raw: "Download Raw Manuscript",
  books_detail_download_cleaned: "Download Cleaned HTML",
  books_detail_download_final_pdf: "Download Final Clean PDF",
  books_detail_download_raw_success: "Raw manuscript download started",
  books_detail_download_cleaned_success: "Cleaned HTML download started",
  books_detail_download_final_pdf_success: "Final clean PDF download started",
  books_detail_download_error_title: "Unable to download file",
  books_detail_download_error_description:
    "The requested book file could not be downloaded right now.",
  books_detail_error_title: "Unable to load admin book details",
  books_detail_error_description:
    "We couldn't load the book workspace right now. Please try again.",
  books_detail_refetch: "Reload Book",
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

jest.mock("next/dynamic", () => () => {
  return function DynamicComponent(props: { fileName?: string }) {
    return <div data-testid="dynamic-pdf-viewer">{props.fileName ?? "pdf"}</div>;
  };
});

jest.mock("@/hooks/useAdminBookDetail", () => ({
  useAdminBookDetail: (input: unknown) => useAdminBookDetailMock(input),
}));

jest.mock("@/hooks/useAdminBookActions", () => {
  const actual = jest.requireActual("@/hooks/useAdminBookActions");

  return {
    ...actual,
    useAdminBookStatusMutation: (bookId: string) => useAdminBookStatusMutationMock(bookId),
    useAdminBookRejectMutation: (bookId: string) => useAdminBookRejectMutationMock(bookId),
    useAdminBookHtmlUploadMutation: (bookId: string) => useAdminBookHtmlUploadMutationMock(bookId),
    useAdminBookDownloadMutation: (bookId: string) => useAdminBookDownloadMutationMock(bookId),
    useAdminBookVersionFileDownloadMutation: (bookId: string) =>
      useAdminBookVersionFileDownloadMutationMock(bookId),
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

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function createBookDetail() {
  return {
    id: "book_1",
    orderId: "ord_1",
    status: "FORMATTING",
    productionStatus: "FORMATTING_REVIEW",
    displayStatus: "FORMATTING_REVIEW",
    statusSource: "production",
    title: "The Lagos Chronicle",
    coverImageUrl: null,
    latestProcessingError: "Preview render stalled on chapter 7.",
    rejectionReason: null,
    rejectedAt: null,
    rejectedBy: null,
    pageCount: 184,
    wordCount: 42100,
    estimatedPages: 188,
    fontFamily: "Miller Text",
    fontSize: 12,
    pageSize: "A5",
    currentHtmlUrl: "https://example.com/current.html",
    previewPdfUrl: "https://example.com/preview.pdf",
    finalPdfUrl: "https://example.com/final.pdf",
    uploadedAt: "2026-03-10T09:30:00.000Z",
    version: 3,
    createdAt: "2026-03-10T09:30:00.000Z",
    updatedAt: "2026-03-11T14:45:00.000Z",
    rollout: {
      environment: "development",
      allowInFlightAccess: true,
      isGrandfathered: false,
      blockedBy: null,
      workspace: { enabled: true, access: "enabled" },
      manuscriptPipeline: { enabled: true, access: "enabled" },
      billingGate: { enabled: true, access: "enabled" },
      finalPdf: { enabled: true, access: "enabled" },
    },
    processing: {
      isActive: true,
      currentStep: "COUNTING_PAGES",
      jobStatus: "processing",
      trigger: "upload",
      startedAt: "2026-03-11T14:40:00.000Z",
      attempt: 1,
      maxAttempts: 3,
    },
    timeline: [],
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
    files: [
      {
        id: "file_raw_1",
        fileType: "RAW_MANUSCRIPT",
        url: "https://example.com/raw.docx",
        fileName: "lagos-chronicle.docx",
        fileSize: 21000,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        version: 1,
        createdBy: "user_1",
        createdAt: "2026-03-10T09:31:00.000Z",
      },
      {
        id: "file_html_1",
        fileType: "CLEANED_HTML",
        url: "https://example.com/cleaned.html",
        fileName: "lagos-chronicle.html",
        fileSize: 12000,
        mimeType: "text/html",
        version: 2,
        createdBy: "admin_1",
        createdAt: "2026-03-11T13:10:00.000Z",
      },
      {
        id: "file_pdf_1",
        fileType: "PREVIEW_PDF",
        url: "https://example.com/preview.pdf",
        fileName: "lagos-chronicle-preview.pdf",
        fileSize: 31000,
        mimeType: "application/pdf",
        version: 3,
        createdBy: "admin_1",
        createdAt: "2026-03-11T14:10:00.000Z",
      },
    ],
    statusControl: {
      currentStatus: "FORMATTING_REVIEW",
      statusSource: "production",
      expectedVersion: 3,
      nextAllowedStatuses: ["PREVIEW_READY", "REVIEW"],
      canRejectManuscript: true,
      canUploadHtmlFallback: true,
    },
  };
}

function createDetailQueryState() {
  return {
    data: createBookDetail(),
    book: createBookDetail(),
    error: null,
    isError: false,
    isInitialLoading: false,
    refetch: jest.fn(),
  };
}

function createMutationState(overrides?: Record<string, unknown>) {
  return {
    mutateAsync: jest.fn(),
    isPending: false,
    variables: undefined,
    ...overrides,
  };
}

describe("AdminBookDetailView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAdminBookDetailMock.mockReturnValue(createDetailQueryState());
    useAdminBookStatusMutationMock.mockReturnValue(createMutationState());
    useAdminBookRejectMutationMock.mockReturnValue(createMutationState());
    useAdminBookHtmlUploadMutationMock.mockReturnValue(createMutationState());
    useAdminBookDownloadMutationMock.mockReturnValue(createMutationState());
    useAdminBookVersionFileDownloadMutationMock.mockReturnValue(createMutationState());
  });

  it("renders the summary, file lineage, and workflow blocks", async () => {
    const user = userEvent.setup();

    render(<AdminBookDetailView bookId="book_1" />);

    expect(screen.getByRole("heading", { name: "The Lagos Chronicle" })).toBeInTheDocument();
    expect(screen.getByText("Book Summary")).toBeInTheDocument();
    expect(screen.getByText("File Lineage")).toBeInTheDocument();
    expect(screen.getByText("Workflow Actions")).toBeInTheDocument();
    expect(screen.getByText("Page Count")).toBeInTheDocument();
    expect(screen.getByText("Word Count")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Order" })).toHaveAttribute(
      "href",
      "/admin/orders/ord_1"
    );

    await user.click(screen.getByRole("button", { name: "Verify PDF" }));
    expect(screen.getByText("PDF Verifier")).toBeInTheDocument();
    expect(screen.getByTestId("dynamic-pdf-viewer")).toHaveTextContent(
      "lagos-chronicle-preview.pdf"
    );
  });

  it("shows the friendly conflict banner when a status transition returns 409", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest
      .fn()
      .mockRejectedValue(new AdminBookConflictError("Another admin updated this book."));

    useAdminBookStatusMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminBookDetailView bookId="book_1" />);

    const advanceButton = await screen.findByRole("button", { name: "Advance Status" });
    await waitFor(() => expect(advanceButton).toBeEnabled());
    await user.click(advanceButton);

    expect(mutateAsync).toHaveBeenCalledWith({
      nextStatus: "PREVIEW_READY",
      expectedVersion: 3,
      reason: undefined,
      note: undefined,
    });
    expect(await screen.findByText("This book changed in another session")).toBeInTheDocument();
    expect(screen.getByText("Another admin updated this book.")).toBeInTheDocument();
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("opens the reject dialog and submits the required reason", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({
      nextStatus: "REJECTED",
    });

    useAdminBookRejectMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminBookDetailView bookId="book_1" />);

    await user.click(screen.getByRole("button", { name: "Reject Manuscript" }));
    expect(screen.getByText("Reject This Manuscript")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "Send Rejection" });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Rejection Reason" }), {
      target: {
        value: "Please fix the chapter heading hierarchy.",
      },
    });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(mutateAsync).toHaveBeenCalledWith({
      expectedVersion: 3,
      rejectionReason: "Please fix the chapter heading hierarchy.",
    });
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("rejects unsupported HTML uploads before the mutation runs", () => {
    const htmlUploadMutation = createMutationState();
    useAdminBookHtmlUploadMutationMock.mockReturnValue(htmlUploadMutation);

    const { container } = render(<AdminBookDetailView bookId="book_1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["hello"], "notes.txt", { type: "text/plain" })],
      },
    });

    expect(htmlUploadMutation.mutateAsync).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Unable to upload cleaned HTML", {
      description: "Choose an HTML file ending in .html or .htm.",
    });
  });

  it("shows HTML upload progress while the fallback upload is running", async () => {
    let resolveUpload: (() => void) | undefined;
    const user = userEvent.setup();
    const htmlUploadMutation = createMutationState({
      isPending: true,
      mutateAsync: jest.fn().mockImplementation(
        ({ onProgress }: { onProgress?: (percentage: number) => void }) =>
          new Promise((resolve) => {
            onProgress?.(40);
            resolveUpload = () => {
              onProgress?.(100);
              resolve({ action: "finalize" });
            };
          })
      ),
    });

    useAdminBookHtmlUploadMutationMock.mockReturnValue(htmlUploadMutation);

    const { container } = render(<AdminBookDetailView bookId="book_1" />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(fileInput).not.toBeNull();

    await user.upload(
      fileInput as HTMLInputElement,
      new File(["<p>Hello</p>"], "manual.html", { type: "text/html" })
    );

    expect(await screen.findByRole("status")).toHaveTextContent("manual.html");
    expect(screen.getByRole("status")).toHaveTextContent("40%");
    expect(screen.getByRole("progressbar", { name: "HTML upload progress" })).toBeInTheDocument();

    const completeUpload = resolveUpload;
    if (!completeUpload) {
      throw new Error("Expected upload resolver to be assigned.");
    }

    await act(async () => {
      completeUpload();
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("100%");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Cleaned HTML uploaded", {
      description: "The cleaned HTML was stored and the downstream processing queue was resumed.",
    });
  });

  it("downloads the final clean PDF from the workflow actions panel", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue(undefined);

    useAdminBookDownloadMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminBookDetailView bookId="book_1" />);

    await user.click(screen.getByRole("button", { name: "Download Final Clean PDF" }));

    expect(mutateAsync).toHaveBeenCalledWith("final-pdf");
    expect(toastSuccessMock).toHaveBeenCalledWith("Final clean PDF download started");
  });

  it("downloads a file lineage asset with its recorded filename flow", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue(undefined);

    useAdminBookVersionFileDownloadMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminBookDetailView bookId="book_1" />);

    await user.click(screen.getAllByRole("button", { name: "Download File" })[0]);

    expect(mutateAsync).toHaveBeenCalledWith("file_raw_1");
    expect(toastSuccessMock).toHaveBeenCalledWith("File download started");
  });
});
