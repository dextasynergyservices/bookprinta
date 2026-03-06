import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { BooksView } from "./BooksView";

const useBookProgressMock = jest.fn();
const useOrdersMock = jest.fn();
let currentBookId: string | null = null;

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
  book_progress_empty_title: "Select a book to view progress",
  book_progress_empty_description:
    "Choose an order with a linked book to see its production pipeline.",
  book_progress_empty_cta: "Go to Orders",
  book_progress_current_stage: "Current stage: {stage}",
  book_progress_rejection_reason_label: "Rejection reason",
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
  loading: "Loading...",
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
    get: (key: string) => (key === "bookId" ? currentBookId : null),
  }),
}));

jest.mock("@/hooks/useBookProgress", () => ({
  useBookProgress: (...args: unknown[]) => useBookProgressMock(...args),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: (...args: unknown[]) => useOrdersMock(...args),
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

describe("BooksView route integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOrdersMock.mockReturnValue({
      items: [],
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
  });

  it("shows empty state when no bookId query param is provided", () => {
    currentBookId = null;
    useBookProgressMock.mockReturnValue({
      data: {
        currentStage: "PAYMENT_RECEIVED",
        timeline: [],
        rejectionReason: null,
      },
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
      data: {
        currentStage: "PAYMENT_RECEIVED",
        timeline: [],
        rejectionReason: null,
      },
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
      data: {
        currentStage: "PRINTING",
        timeline: [
          {
            stage: "PRINTING",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PRINTING",
          },
        ],
        rejectionReason: null,
      },
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
      data: {
        currentStage: "PAYMENT_RECEIVED",
        timeline: [],
        rejectionReason: null,
      },
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
      data: {
        currentStage: "PAYMENT_RECEIVED",
        timeline: [],
        rejectionReason: null,
      },
      isInitialLoading: false,
      isError: true,
      isFetching: false,
      refetch,
      error: new Error("Book not found"),
    });

    render(<BooksView />);

    expect(screen.getByText("Unable to load book progress")).toBeInTheDocument();
    expect(screen.getByText("Book not found")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    retryButton.focus();
    await user.keyboard("{Enter}");
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders tracker with translated current stage summary", () => {
    currentBookId = "cm1111111111111111111111111";
    useBookProgressMock.mockReturnValue({
      data: {
        currentStage: "PRINTING",
        timeline: [
          {
            stage: "PRINTING",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PRINTING",
          },
        ],
        rejectionReason: null,
      },
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
      data: {
        currentStage: "PRINTING",
        timeline: [
          {
            stage: "PRINTING",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PRINTING",
          },
        ],
        rejectionReason: null,
      },
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
});
