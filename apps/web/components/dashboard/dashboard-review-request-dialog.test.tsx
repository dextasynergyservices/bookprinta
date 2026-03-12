import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  DashboardReviewRequestDialog,
  type ReviewRequestDialogTarget,
} from "./dashboard-review-request-dialog";

const useReviewStateMock = jest.fn();
const useCreateReviewMock = jest.fn();
const submitReviewMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    typeof values?.count === "number" ? `${key}-${values.count}` : key,
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useReviewState: () => useReviewStateMock(),
  useCreateReview: () => useCreateReviewMock(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("DashboardReviewRequestDialog", () => {
  const target: ReviewRequestDialogTarget = {
    bookId: "cm1111111111111111111111111",
    bookTitle: "The Lagos Chronicle",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    useReviewStateMock.mockReturnValue({
      books: [
        {
          bookId: target.bookId,
          title: target.bookTitle,
          coverImageUrl: null,
          lifecycleStatus: "DELIVERED",
          reviewStatus: "PENDING",
          review: null,
        },
      ],
      isLoading: false,
    });
    useCreateReviewMock.mockReturnValue({
      submitReview: submitReviewMock,
      isPending: false,
    });
    submitReviewMock.mockResolvedValue({
      book: {
        bookId: target.bookId,
        title: target.bookTitle,
        coverImageUrl: null,
        lifecycleStatus: "DELIVERED",
        reviewStatus: "REVIEWED",
        review: {
          rating: 4,
          comment: "Excellent support.",
          isPublic: false,
          createdAt: "2026-03-07T12:00:00.000Z",
        },
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("submits a review, shows the success state, and auto-closes after 2 seconds", async () => {
    jest.useFakeTimers();
    const onOpenChange = jest.fn();
    const onReviewSubmitted = jest.fn();

    render(
      <DashboardReviewRequestDialog
        open
        target={target}
        onOpenChange={onOpenChange}
        onReviewSubmitted={onReviewSubmitted}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: "review_dialog_rating_option-4" }));
    fireEvent.change(screen.getByLabelText("review_comment"), {
      target: { value: "Excellent support." },
    });
    fireEvent.click(screen.getByRole("button", { name: "review_submit" }));

    await waitFor(() => {
      expect(submitReviewMock).toHaveBeenCalledWith({
        bookId: target.bookId,
        rating: 4,
        comment: "Excellent support.",
      });
    });

    await waitFor(() => {
      expect(onReviewSubmitted).toHaveBeenCalledWith(target.bookId);
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "review_thanks" })).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  }, 15_000);

  it("supports keyboard star selection", async () => {
    const onOpenChange = jest.fn();

    render(<DashboardReviewRequestDialog open target={target} onOpenChange={onOpenChange} />);

    const firstStar = screen.getByRole("radio", { name: "review_dialog_rating_option-1" });
    firstStar.focus();

    fireEvent.keyDown(firstStar, { key: "End" });
    fireEvent.click(screen.getByRole("button", { name: "review_submit" }));

    await waitFor(() => {
      expect(submitReviewMock).toHaveBeenCalledWith({
        bookId: target.bookId,
        rating: 5,
        comment: "",
      });
    });
  });

  it("supports click-based star selection", () => {
    const onOpenChange = jest.fn();

    render(<DashboardReviewRequestDialog open target={target} onOpenChange={onOpenChange} />);

    const thirdStar = screen.getByRole("radio", { name: "review_dialog_rating_option-3" });
    const fifthStar = screen.getByRole("radio", { name: "review_dialog_rating_option-5" });

    fireEvent.click(thirdStar);
    expect(thirdStar).toHaveAttribute("aria-checked", "true");
    expect(fifthStar).toHaveAttribute("aria-checked", "false");

    fireEvent.click(fifthStar);
    expect(thirdStar).toHaveAttribute("aria-checked", "false");
    expect(fifthStar).toHaveAttribute("aria-checked", "true");
  });
});
