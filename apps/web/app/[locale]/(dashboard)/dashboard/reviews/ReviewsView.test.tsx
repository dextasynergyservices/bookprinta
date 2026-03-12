import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewsView } from "./ReviewsView";

const useReviewStateMock = jest.fn();

type TranslationNamespace = "dashboard" | "common";

const TRANSLATIONS: Record<TranslationNamespace, Record<string, string>> = {
  dashboard: {
    reviews: "Reviews",
    reviews_page_subtitle:
      "Track every delivered book that is waiting for feedback or already reviewed.",
    reviews_empty_title: "No review-ready books yet",
    reviews_empty_description:
      "Delivered books will appear here once they are ready for your feedback.",
    reviews_error_title: "Unable to load reviews",
    reviews_error_description: "We couldn't load your review history right now. Please try again.",
    reviews_cover_alt: "Cover image for {title}",
    reviews_lifecycle_label: "Delivery status",
    reviews_lifecycle_completed: "Completed",
    review_pending: "Pending",
    review_submitted: "Reviewed",
    review_dialog_book_fallback: "Your latest book",
    book_progress_stage_delivered: "Delivered",
    book_progress_stage_printed: "Printed",
    book_progress_stage_shipping: "Shipping",
    orders_unknown_status: "Status unavailable",
  },
  common: {
    loading: "Loading...",
    retry: "Try Again",
  },
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
    (namespace: TranslationNamespace) => (key: string, values?: Record<string, unknown>) => {
      const template = TRANSLATIONS[namespace]?.[key] ?? key;
      return interpolate(template, values);
    },
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useReviewState: () => useReviewStateMock(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    fill: _fill,
    loader: _loader,
    sizes: _sizes,
    unoptimized: _unoptimized,
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    loader?: unknown;
    sizes?: string;
    unoptimized?: boolean;
    [key: string]: unknown;
  }) => <span role="img" aria-label={alt} data-src={src} {...props} />,
}));

describe("ReviewsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders delivered review cards with cover thumbnails and status badges", () => {
    useReviewStateMock.mockReturnValue({
      books: [
        {
          bookId: "cm1111111111111111111111111",
          title: "The Lagos Chronicle",
          coverImageUrl: "https://res.cloudinary.com/bookprinta/image/upload/lagos-cover.jpg",
          lifecycleStatus: "DELIVERED",
          reviewStatus: "PENDING",
          review: null,
        },
        {
          bookId: "cm2222222222222222222222222",
          title: "A New Dawn",
          coverImageUrl: null,
          lifecycleStatus: "COMPLETED",
          reviewStatus: "REVIEWED",
          review: {
            rating: 5,
            comment: "Excellent support.",
            isPublic: false,
            createdAt: "2026-03-09T12:00:00.000Z",
          },
        },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      isFallback: false,
      refetch: jest.fn(),
    });

    render(<ReviewsView />);

    expect(screen.getByRole("heading", { name: "Reviews" })).toBeInTheDocument();
    expect(screen.getByText(TRANSLATIONS.dashboard.reviews_page_subtitle)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Cover image for The Lagos Chronicle" })
    ).toHaveAttribute(
      "data-src",
      "https://res.cloudinary.com/bookprinta/image/upload/lagos-cover.jpg"
    );
    expect(screen.getByText("Pending")).toHaveAttribute("data-tone", "pending");
    expect(screen.getByText("Reviewed")).toHaveAttribute("data-tone", "reviewed");
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Excellent support.")).toBeInTheDocument();
  });

  it("renders an empty state when there are no delivered review books", () => {
    useReviewStateMock.mockReturnValue({
      books: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      isFallback: false,
      refetch: jest.fn(),
    });

    render(<ReviewsView />);

    expect(screen.getByText("No review-ready books yet")).toBeInTheDocument();
    expect(
      screen.getByText("Delivered books will appear here once they are ready for your feedback.")
    ).toBeInTheDocument();
  });

  it("renders an error state and retries loading", async () => {
    const user = userEvent.setup();
    const refetch = jest.fn().mockResolvedValue(undefined);

    useReviewStateMock.mockReturnValue({
      books: [],
      isLoading: false,
      isFetching: false,
      isError: true,
      isFallback: false,
      refetch,
    });

    render(<ReviewsView />);

    expect(screen.getByText("Unable to load reviews")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try Again" }));

    await waitFor(() => {
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });
});
