import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManuscriptPreviewPanel } from "./manuscript-preview-panel";

const updateBookSettingsMock = jest.fn();
const toastSuccessMock = jest.fn();

const TRANSLATIONS: Record<string, string> = {
  book_progress_browser_preview_title: "Browser Preview",
  book_progress_browser_preview_heading: "Live layout preview",
  book_progress_browser_preview_subtitle:
    "Review how the current HTML renders before the server count finishes.",
  book_progress_browser_preview_settings_title: "Layout Settings",
  book_progress_browser_preview_settings_hint:
    "Changing size or font reruns formatting and recounts pages.",
  book_progress_browser_preview_settings_locked: "Settings are locked after approval.",
  book_progress_browser_preview_processing: "Processing manuscript",
  book_progress_browser_preview_reprocessing: "Reprocessing preview",
  book_progress_browser_preview_processing_note:
    "Approval stays locked until the first browser preview and server count are ready.",
  book_progress_browser_preview_reprocessing_note:
    "Approval stays locked until the updated server count finishes.",
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
    "The updated HTML is ready. Waiting for the server-side billing count.",
  book_progress_browser_preview_note:
    "This preview is browser-side only. Billing always uses the server-rendered count.",
  book_progress_browser_preview_latest_count: "Latest authoritative count: {count} pages",
  book_progress_browser_preview_empty_title: "Upload a manuscript first",
  book_progress_browser_preview_empty_body:
    "The browser preview will appear here once your manuscript has been processed.",
  book_progress_browser_preview_unavailable: "The browser preview is not available right now.",
  book_progress_browser_preview_error: "Unable to load the browser preview right now.",
  book_progress_browser_preview_settings_error: "Unable to save preview settings right now.",
  book_progress_browser_preview_frame_title: "Formatted manuscript browser preview",
  manuscript_upload_book_size_a4: "A4",
  manuscript_upload_book_size_a4_desc: "Standard trim with more words per page.",
  manuscript_upload_book_size_a5: "A5",
  manuscript_upload_book_size_a5_desc: "Compact trim with fewer words per page.",
  manuscript_upload_font_size_value: "{size}pt",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

function createFetchResponse(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => body,
  } as Response;
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

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    interpolate(TRANSLATIONS[key] ?? key, values),
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
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
  };
});

describe("ManuscriptPreviewPanel", () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const [firstArg] = args;
      if (typeof firstArg === "string" && firstArg.includes("not wrapped in act")) {
        return;
      }

      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    toastSuccessMock.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the browser preview from currentHtmlUrl", async () => {
    fetchMock.mockResolvedValue(
      createFetchResponse("<main><h1>Chapter One</h1><script>alert('x')</script></main>")
    );

    render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A5"
        fontSize={11}
        currentHtmlUrl="https://example.com/current.html"
        currentStatus="PREVIEW_READY"
        pageCount={176}
        processing={createProcessingState()}
        hasUploadedManuscript
        forceReprocessing={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByTitle("Formatted manuscript browser preview")).toBeInTheDocument()
    );

    const frame = screen.getByTitle("Formatted manuscript browser preview");
    const srcDoc = frame.getAttribute("srcdoc") ?? "";

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/current.html",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      })
    );
    expect(srcDoc).toContain("Chapter One");
    expect(srcDoc).toContain("/vendor/pagedjs-polyfill.js");
    expect(srcDoc).not.toContain("unpkg.com/pagedjs");
    expect(srcDoc).not.toContain("<script>alert('x')</script>");
    expect(srcDoc).toContain(".book-major-heading");
    expect(srcDoc).toContain("break-before: page");
    expect(screen.getByText("Latest authoritative count: 176 pages")).toBeInTheDocument();
  });

  it("auto-saves changed settings and triggers rerun start", async () => {
    jest.useFakeTimers();
    updateBookSettingsMock.mockResolvedValue({
      id: "cm_book_1",
      pageSize: "A5",
      fontSize: 14,
      wordCount: 42000,
      estimatedPages: 190,
      updatedAt: "2026-03-07T10:00:00.000Z",
    });

    const onSettingsReprocessingStart = jest.fn();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A5"
        fontSize={11}
        currentHtmlUrl={null}
        currentStatus="PREVIEW_READY"
        pageCount={176}
        processing={createProcessingState()}
        hasUploadedManuscript
        forceReprocessing={false}
        onSettingsReprocessingStart={onSettingsReprocessingStart}
      />
    );

    await user.click(screen.getByRole("button", { name: "14pt" }));

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(updateBookSettingsMock).toHaveBeenCalledWith({
        bookId: "cm_book_1",
        pageSize: "A5",
        fontSize: 14,
      })
    );
    await waitFor(() => expect(onSettingsReprocessingStart).toHaveBeenCalledTimes(1));
  });

  it("shows reprocessing state and hides the stale iframe while rerun is active", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-07T10:05:00.000Z"));
    fetchMock.mockResolvedValue(createFetchResponse("<main><p>Old preview</p></main>"));

    render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A4"
        fontSize={12}
        currentHtmlUrl="https://example.com/current.html"
        currentStatus="AI_PROCESSING"
        pageCount={null}
        processing={createProcessingState({
          isActive: true,
          currentStep: "AI_FORMATTING",
          jobStatus: "processing",
          trigger: "settings_change",
          startedAt: "2026-03-07T10:04:15.000Z",
          attempt: 1,
          maxAttempts: 3,
        })}
        hasUploadedManuscript
        forceReprocessing
      />
    );

    expect(screen.getByText(/Reprocessing preview/)).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Elapsed 00:00")).toBeInTheDocument();
    expect(screen.getByText("Attempt 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Formatting manuscript with AI")).toBeInTheDocument();
    expect(
      screen.getByText("Cleaning and formatting your manuscript with AI.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can leave this page while we keep processing your manuscript in the background."
      )
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Formatted manuscript browser preview")).not.toBeInTheDocument();
    expect(
      screen.getByText("Approval stays locked until the updated server count finishes.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A4/ })).toBeDisabled();
  });

  it("shows upload-specific processing copy for a first manuscript run", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-07T10:05:00.000Z"));

    render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A4"
        fontSize={12}
        currentHtmlUrl={null}
        currentStatus="AI_PROCESSING"
        pageCount={null}
        processing={createProcessingState({
          isActive: true,
          currentStep: "AI_FORMATTING",
          jobStatus: "processing",
          trigger: "upload",
          startedAt: "2026-03-07T10:04:10.000Z",
        })}
        hasUploadedManuscript
        forceReprocessing={false}
      />
    );

    expect(screen.getByText(/Processing manuscript/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Approval stays locked until the first browser preview and server count are ready."
      )
    ).toBeInTheDocument();
  });

  it("shows a retry state instead of live processing when formatting needs attention", () => {
    render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A4"
        fontSize={12}
        currentHtmlUrl={null}
        currentStatus="FORMATTING_REVIEW"
        latestProcessingError='Gemini request failed (429): {"error":{"message":"Rate limit exceeded"}}'
        pageCount={null}
        processing={createProcessingState()}
        hasUploadedManuscript
        forceReprocessing={false}
        canRetryProcessing
        onRetryProcessing={() => undefined}
      />
    );

    expect(screen.getByText("Formatting needs attention")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Automated formatting stopped before the preview was generated. Retry processing to start a fresh AI run."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Gemini request failed (429): {"error":{"message":"Rate limit exceeded"}}')
    ).toBeInTheDocument();
    expect(screen.getByText("The browser preview is not available right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry processing" })).toBeInTheDocument();
    expect(screen.queryByText(/Processing manuscript/)).not.toBeInTheDocument();
  });

  it("shows a completion toast when the rerun finishes with a fresh preview and count", async () => {
    fetchMock.mockResolvedValue(createFetchResponse("<main><p>Fresh preview</p></main>"));

    const { rerender } = render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A4"
        fontSize={12}
        currentHtmlUrl={null}
        currentStatus="FORMATTING"
        pageCount={null}
        processing={createProcessingState({
          isActive: true,
          currentStep: "AI_FORMATTING",
          jobStatus: "processing",
          trigger: "settings_change",
          startedAt: "2026-03-07T10:04:15.000Z",
        })}
        hasUploadedManuscript
        forceReprocessing
      />
    );

    rerender(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A4"
        fontSize={12}
        currentHtmlUrl="https://example.com/current.html"
        currentStatus="PREVIEW_READY"
        pageCount={176}
        processing={createProcessingState()}
        hasUploadedManuscript
        forceReprocessing={false}
      />
    );

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Your updated preview and page count are ready."
      )
    );
  });

  it("shows a delayed notice when server-side processing no longer has a trustworthy timer", () => {
    render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A4"
        fontSize={12}
        currentHtmlUrl={null}
        currentStatus="FORMATTING"
        pageCount={null}
        processing={createProcessingState({
          isActive: true,
          currentStep: "AI_FORMATTING",
          jobStatus: "processing",
          trigger: "upload",
          startedAt: null,
        })}
        hasUploadedManuscript
        forceReprocessing={false}
        canRetryProcessing
        onRetryProcessing={() => undefined}
      />
    );

    expect(
      screen.getByText(
        "This run is taking longer than expected. You can leave this page while we continue processing in the background."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry processing" })).toBeInTheDocument();
    expect(screen.queryByText(/Elapsed /)).not.toBeInTheDocument();
  });

  it("calls the retry handler when the delayed retry action is pressed", async () => {
    const user = userEvent.setup();
    const onRetryProcessing = jest.fn();

    render(
      <ManuscriptPreviewPanel
        bookId="cm_book_1"
        pageSize="A4"
        fontSize={12}
        currentHtmlUrl={null}
        currentStatus="FORMATTING"
        pageCount={null}
        processing={createProcessingState({
          isActive: true,
          currentStep: "AI_FORMATTING",
          jobStatus: "processing",
          trigger: "upload",
          startedAt: null,
        })}
        hasUploadedManuscript
        forceReprocessing={false}
        canRetryProcessing
        onRetryProcessing={onRetryProcessing}
      />
    );

    await user.click(screen.getByRole("button", { name: "Retry processing" }));

    expect(onRetryProcessing).toHaveBeenCalledTimes(1);
  });
});
