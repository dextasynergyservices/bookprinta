import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManuscriptUploadFlow } from "./manuscript-upload-flow";

const updateBookSettingsMock = jest.fn();
const uploadManuscriptWithProgressMock = jest.fn();
const useOnlineStatusMock = jest.fn();
const toastSuccessMock = jest.fn();

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const TRANSLATIONS: Record<string, string> = {
  manuscript_upload_title: "Upload manuscript",
  manuscript_upload_subtitle: "Choose your layout settings, then upload a DOCX or PDF.",
  manuscript_upload_steps_aria: "Manuscript upload steps",
  manuscript_upload_step_settings: "Settings",
  manuscript_upload_step_upload: "Upload",
  manuscript_upload_step_result: "Result",
  manuscript_upload_book_title_label: "Book title",
  manuscript_upload_book_title_hint:
    "Add the title you want us to use across your dashboard and reviews.",
  manuscript_upload_book_title_placeholder: "Enter your book title",
  manuscript_upload_book_size_label: "Book size",
  manuscript_upload_book_size_hint: "Choose the trim size before upload.",
  manuscript_upload_book_size_a4: "A4",
  manuscript_upload_book_size_a4_desc: "Standard trim with more words per page.",
  manuscript_upload_book_size_a5: "A5",
  manuscript_upload_book_size_a5_desc: "Compact trim with fewer words per page.",
  manuscript_upload_font_size_label: "Font size",
  manuscript_upload_font_size_hint: "Pick the type size for your manuscript preview.",
  manuscript_upload_font_size_value: "{size}pt",
  manuscript_upload_back_to_settings: "Back to Settings",
  manuscript_upload_error_title_required: "Add your book title to continue.",
  manuscript_upload_error_book_size_required: "Select a book size to continue.",
  manuscript_upload_error_font_size_required: "Choose a font size to continue.",
  manuscript_upload_error_settings_required: "Select book size and font size before uploading.",
  manuscript_upload_error_file_type: "Only DOCX and PDF files are supported.",
  manuscript_upload_error_file_size: "File must be 10MB or smaller.",
  manuscript_upload_error_file_empty: "File cannot be empty.",
  manuscript_upload_error_generic: "Unable to upload manuscript right now.",
  manuscript_upload_error_scanner_unavailable: "File scanning temporarily unavailable",
  manuscript_upload_continue: "Save Settings",
  manuscript_upload_save_settings: "Saving settings...",
  manuscript_upload_dropzone_aria: "Drag and drop your manuscript",
  manuscript_upload_dropzone_label: "Drop your manuscript here",
  manuscript_upload_dropzone_helper: "Or tap to choose a file from your device.",
  manuscript_upload_dropzone_formats: "DOCX or PDF only, max 10MB.",
  manuscript_upload_choose_file: "Choose File",
  manuscript_upload_progress_label: "Upload progress",
  manuscript_upload_processing_extracting_word_count: "Extracting word count",
  manuscript_upload_estimated_pages_label: "Estimated pages before formatting",
  manuscript_upload_estimated_pages_helper:
    "Quick guide from word count and your selected trim size and font size.",
  manuscript_upload_word_count_label: "{count} words",
  manuscript_upload_word_count_approximate_label: "Approximate word count: ~{count}",
  manuscript_upload_word_count_label_standalone: "Words in your manuscript",
  manuscript_upload_word_count_approximate_label_standalone: "Approximate words extracted",
  manuscript_upload_pages_confirmed_after_formatting:
    "Your exact page count will be confirmed once formatting is complete.",
  manuscript_upload_received_label: "Manuscript received",
  manuscript_upload_success_toast: "Manuscript uploaded successfully",
  manuscript_upload_document_pages_label: "Approximate pages in your document",
  manuscript_upload_document_pages_helper: "Extracted from your file metadata.",
  manuscript_upload_replace_file: "Replace file",
  offline_banner: "You're offline — some features require an internet connection",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    interpolate(TRANSLATIONS[key] ?? key, values),
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
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

  return { motion };
});

jest.mock("@/hooks/useManuscriptUpload", () => {
  const actual = jest.requireActual(
    "@/hooks/useManuscriptUpload"
  ) as typeof import("@/hooks/useManuscriptUpload");

  return {
    ...actual,
    updateBookSettings: (...args: Parameters<typeof actual.updateBookSettings>) =>
      updateBookSettingsMock(...args),
    uploadManuscriptWithProgress: (
      ...args: Parameters<typeof actual.uploadManuscriptWithProgress>
    ) => uploadManuscriptWithProgressMock(...args),
  };
});

describe("ManuscriptUploadFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setViewportWidth(375);
    useOnlineStatusMock.mockReturnValue(true);
  });

  it("requires book size and font size before moving to upload", async () => {
    const user = userEvent.setup();

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle={null}
        initialPageSize={null}
        initialFontSize={null}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(screen.getByText("Add your book title to continue.")).toBeInTheDocument();
    expect(updateBookSettingsMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Book title"), "The Lagos Chronicle");
    await user.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(screen.getByText("Select a book size to continue.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^A4/ }));
    await user.click(screen.getByRole("button", { name: "Save Settings" }));

    expect(screen.getByText("Choose a font size to continue.")).toBeInTheDocument();
    expect(updateBookSettingsMock).not.toHaveBeenCalled();
  });

  it("preserves spaces while typing the title and saves it correctly", async () => {
    const user = userEvent.setup();
    updateBookSettingsMock.mockResolvedValue({
      id: "cm_book_1",
      title: "The Lagos Chronicle",
      pageSize: "A4",
      fontSize: 12,
      wordCount: null,
      estimatedPages: null,
      updatedAt: "2026-03-11T10:00:00.000Z",
    });

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle={null}
        initialPageSize={null}
        initialFontSize={null}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const titleInput = screen.getByLabelText("Book title");
    await user.type(titleInput, "The Lagos Chronicle");

    expect(titleInput).toHaveValue("The Lagos Chronicle");

    await user.click(screen.getByRole("button", { name: /^A4/ }));
    await user.click(screen.getByRole("button", { name: "12pt" }));
    await user.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(updateBookSettingsMock).toHaveBeenCalledWith({
        bookId: "cm_book_1",
        title: "The Lagos Chronicle",
        pageSize: "A4",
        fontSize: 12,
      })
    );

    expect(screen.getByRole("button", { name: "Back to Settings" })).toBeInTheDocument();
  });

  it("lets the user go back to settings from the upload step", async () => {
    const user = userEvent.setup();

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A5"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "Back to Settings" }));

    expect(screen.getByLabelText("Book title")).toHaveValue("Story Title");
    expect(screen.getByRole("button", { name: "Save Settings" })).toBeInTheDocument();
  });

  it("lets the user reopen settings after a manuscript estimate exists", async () => {
    const user = userEvent.setup();

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A5"
        initialFontSize={12}
        initialEstimatedPages={150}
        initialWordCount={42000}
        initialDocumentPageCount={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "Back to Settings" }));

    expect(screen.getByLabelText("Book title")).toHaveValue("Story Title");
    expect(screen.getByRole("button", { name: "Save Settings" })).toBeInTheDocument();
  });

  it("supports mobile drag-and-drop upload with progress, processing, and result states", async () => {
    let resolveUpload = (_value: unknown) => {};
    uploadManuscriptWithProgressMock.mockImplementation(
      ({ onProgress }: { onProgress?: (percentage: number) => void }) =>
        new Promise((resolve) => {
          onProgress?.(38);
          onProgress?.(100);
          resolveUpload = resolve;
        })
    );
    const onUploadSuccess = jest.fn();

    const { container } = render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A5"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
        onUploadSuccess={onUploadSuccess}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });
    const manuscript = new File(["Hello world"], "story.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [manuscript] },
    });

    await waitFor(() =>
      expect(uploadManuscriptWithProgressMock).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: "cm_book_1",
          file: manuscript,
          onProgress: expect.any(Function),
        })
      )
    );

    expect(container.querySelector("section.w-full")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    expect(screen.getByText(/Extracting word count\./)).toBeInTheDocument();

    resolveUpload({
      bookId: "cm_book_1",
      fileId: "file_1",
      fileUrl: "https://example.com/raw.docx",
      fileName: "story.docx",
      fileSize: 1024,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pageSize: "A5",
      fontSize: 12,
      wordCount: 42000,
      estimatedPages: 150,
      documentPageCount: null,
    });

    await waitFor(() => expect(screen.getByText("Words in your manuscript")).toBeInTheDocument());
    expect(screen.getByText("42,000")).toBeInTheDocument();
    expect(
      screen.getByText("Your exact page count will be confirmed once formatting is complete.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/~\s*150/)).not.toBeInTheDocument();
    expect(onUploadSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows client validation errors for unsupported and oversized files", async () => {
    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A4"
        initialFontSize={11}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [new File(["plain"], "story.txt", { type: "text/plain" })],
      },
    });

    expect(screen.getByText("Only DOCX and PDF files are supported.")).toBeInTheDocument();
    expect(uploadManuscriptWithProgressMock).not.toHaveBeenCalled();

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [
          new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    expect(screen.getByText("File must be 10MB or smaller.")).toBeInTheDocument();
    expect(uploadManuscriptWithProgressMock).not.toHaveBeenCalled();
  });

  it("surfaces the scanner-unavailable error from the upload endpoint", async () => {
    uploadManuscriptWithProgressMock.mockRejectedValue(
      new Error("File scanning temporarily unavailable")
    );

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A5"
        initialFontSize={14}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });
    const manuscript = new File(["Hello world"], "story.pdf", {
      type: "application/pdf",
    });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [manuscript] },
    });

    await waitFor(() =>
      expect(screen.getByText("File scanning temporarily unavailable")).toBeInTheDocument()
    );
  });

  it("shows approximate word count label for PDF uploads", async () => {
    uploadManuscriptWithProgressMock.mockImplementation(
      ({ onProgress }: { onProgress?: (percentage: number) => void }) => {
        onProgress?.(100);
        return Promise.resolve({
          bookId: "cm_book_1",
          fileId: "file_1",
          fileUrl: "https://example.com/raw.pdf",
          fileName: "story.pdf",
          fileSize: 2048,
          mimeType: "application/pdf",
          pageSize: "A4",
          fontSize: 12,
          wordCount: 35000,
          estimatedPages: 120,
          documentPageCount: 6,
        });
      }
    );

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A4"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [new File(["content"], "story.pdf", { type: "application/pdf" })],
      },
    });

    await waitFor(() => expect(screen.getByText(/Approximate word count/)).toBeInTheDocument());
    expect(screen.getByText(/~35,000/)).toBeInTheDocument();
    expect(screen.queryByText("35,000 words")).not.toBeInTheDocument();
  });

  it("shows exact word count label for DOCX uploads", async () => {
    uploadManuscriptWithProgressMock.mockImplementation(
      ({ onProgress }: { onProgress?: (percentage: number) => void }) => {
        onProgress?.(100);
        return Promise.resolve({
          bookId: "cm_book_1",
          fileId: "file_1",
          fileUrl: "https://example.com/raw.docx",
          fileName: "story.docx",
          fileSize: 1024,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          pageSize: "A5",
          fontSize: 12,
          wordCount: 42000,
          estimatedPages: 150,
          documentPageCount: null,
        });
      }
    );

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A5"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [
          new File(["content"], "story.docx", {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
        ],
      },
    });

    await waitFor(() => expect(screen.getByText("Words in your manuscript")).toBeInTheDocument());
    expect(screen.getByText("42,000")).toBeInTheDocument();
    expect(screen.queryByText(/Approximate word count/)).not.toBeInTheDocument();
  });

  it("fires a success toast when manuscript upload completes", async () => {
    uploadManuscriptWithProgressMock.mockImplementation(
      ({ onProgress }: { onProgress?: (percentage: number) => void }) => {
        onProgress?.(100);
        return Promise.resolve({
          bookId: "cm_book_1",
          fileId: "file_1",
          fileUrl: "https://example.com/raw.docx",
          fileName: "story.docx",
          fileSize: 1024,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          pageSize: "A5",
          fontSize: 12,
          wordCount: 42000,
          estimatedPages: 150,
          documentPageCount: null,
        });
      }
    );

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A5"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [
          new File(["content"], "story.docx", {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
        ],
      },
    });

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Manuscript uploaded successfully")
    );
  });

  it("renders success checkmark icon on fresh upload", async () => {
    uploadManuscriptWithProgressMock.mockImplementation(
      ({ onProgress }: { onProgress?: (percentage: number) => void }) => {
        onProgress?.(100);
        return Promise.resolve({
          bookId: "cm_book_1",
          fileId: "file_1",
          fileUrl: "https://example.com/raw.pdf",
          fileName: "story.pdf",
          fileSize: 2048,
          mimeType: "application/pdf",
          pageSize: "A4",
          fontSize: 12,
          wordCount: 35000,
          estimatedPages: 120,
          documentPageCount: 6,
        });
      }
    );

    const { container } = render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A4"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [new File(["content"], "story.pdf", { type: "application/pdf" })],
      },
    });

    await waitFor(() =>
      expect(container.querySelector(".lucide-circle-check")).toBeInTheDocument()
    );
  });

  it("disables manuscript upload actions offline", () => {
    useOnlineStatusMock.mockReturnValue(false);

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialTitle="Story Title"
        initialPageSize="A5"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
        initialDocumentPageCount={null}
      />
    );

    const dropZone = screen.getByRole("button", { name: "Drag and drop your manuscript" });
    const manuscript = new File(["Hello world"], "story.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(dropZone).toBeDisabled();
    expect(
      screen.getByText("You're offline — some features require an internet connection")
    ).toBeInTheDocument();

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [manuscript] },
    });

    expect(uploadManuscriptWithProgressMock).not.toHaveBeenCalled();
  });
});
