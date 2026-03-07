import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      pendingBooks: [{ bookId: target.bookId, status: "PRINTED" }],
      reviewedBooks: [],
      isLoading: false,
    });
    useCreateReviewMock.mockReturnValue({
      submitReview: submitReviewMock,
      isPending: false,
    });
    submitReviewMock.mockResolvedValue({
      review: {
        bookId: target.bookId,
        rating: 4,
        comment: "Excellent support.",
        isPublic: false,
        createdAt: "2026-03-07T12:00:00.000Z",
      },
    });
  });

  it("submits a review for the selected book", async () => {
    const onOpenChange = jest.fn();

    render(<DashboardReviewRequestDialog open target={target} onOpenChange={onOpenChange} />);

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
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  }, 15_000);
});
