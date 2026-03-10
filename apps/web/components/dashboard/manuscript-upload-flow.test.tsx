import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManuscriptUploadFlow } from "./manuscript-upload-flow";

const updateBookSettingsMock = jest.fn();
const uploadManuscriptWithProgressMock = jest.fn();

const TRANSLATIONS: Record<string, string> = {
  manuscript_upload_title: "Upload manuscript",
  manuscript_upload_subtitle: "Choose your layout settings, then upload a DOCX or PDF.",
  manuscript_upload_steps_aria: "Manuscript upload steps",
  manuscript_upload_step_settings: "Settings",
  manuscript_upload_step_upload: "Upload",
  manuscript_upload_step_result: "Result",
  manuscript_upload_book_size_label: "Book size",
  manuscript_upload_book_size_hint: "Choose the trim size before upload.",
  manuscript_upload_book_size_a4: "A4",
  manuscript_upload_book_size_a4_desc: "Standard trim with more words per page.",
  manuscript_upload_book_size_a5: "A5",
  manuscript_upload_book_size_a5_desc: "Compact trim with fewer words per page.",
  manuscript_upload_font_size_label: "Font size",
  manuscript_upload_font_size_hint: "Pick the type size for your manuscript preview.",
  manuscript_upload_font_size_value: "{size}pt",
  manuscript_upload_error_book_size_required: "Select a book size to continue.",
  manuscript_upload_error_font_size_required: "Choose a font size to continue.",
  manuscript_upload_error_settings_required: "Select book size and font size before uploading.",
  manuscript_upload_error_file_type: "Only DOCX and PDF files are supported.",
  manuscript_upload_error_file_size: "File must be 10MB or smaller.",
  manuscript_upload_error_file_empty: "File cannot be empty.",
  manuscript_upload_error_generic: "Unable to upload manuscript right now.",
  manuscript_upload_error_scanner_unavailable: "File scanning temporarily unavailable",
  manuscript_upload_continue: "Continue to Upload",
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
  manuscript_upload_replace_file: "Replace file",
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
  });

  it("requires book size and font size before moving to upload", async () => {
    const user = userEvent.setup();

    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialPageSize={null}
        initialFontSize={null}
        initialEstimatedPages={null}
        initialWordCount={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "Continue to Upload" }));
    expect(screen.getByText("Select a book size to continue.")).toBeInTheDocument();
    expect(updateBookSettingsMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^A4/ }));
    await user.click(screen.getByRole("button", { name: "Continue to Upload" }));

    expect(screen.getByText("Choose a font size to continue.")).toBeInTheDocument();
    expect(updateBookSettingsMock).not.toHaveBeenCalled();
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
        initialPageSize="A5"
        initialFontSize={12}
        initialEstimatedPages={null}
        initialWordCount={null}
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
    });

    await waitFor(() =>
      expect(screen.getByText("Estimated pages before formatting")).toBeInTheDocument()
    );
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(
      screen.getByText("Quick guide from word count and your selected trim size and font size.")
    ).toBeInTheDocument();
    expect(screen.getByText("42,000 words")).toBeInTheDocument();
    expect(onUploadSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows client validation errors for unsupported and oversized files", async () => {
    render(
      <ManuscriptUploadFlow
        bookId="cm_book_1"
        initialPageSize="A4"
        initialFontSize={11}
        initialEstimatedPages={null}
        initialWordCount={null}
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
        initialPageSize="A5"
        initialFontSize={14}
        initialEstimatedPages={null}
        initialWordCount={null}
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
});
