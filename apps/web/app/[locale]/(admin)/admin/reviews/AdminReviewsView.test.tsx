import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminReviewsView } from "./AdminReviewsView";

const useAdminReviewsMock = jest.fn();
const useToggleAdminReviewVisibilityMutationMock = jest.fn();
const useModerateAdminReviewMutationMock = jest.fn();
const useDeleteAdminReviewMutationMock = jest.fn();

const toggleMutateAsyncMock = jest.fn();
const moderateMutateAsyncMock = jest.fn();
const deleteMutateAsyncMock = jest.fn();

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "reviews_summary_total") {
      return `reviews_summary_total:${values?.shown}:${values?.page}`;
    }

    if (key === "reviews_filters_active") {
      return `reviews_filters_active:${values?.count}`;
    }

    if (key === "reviews_pagination_page") {
      return `reviews_pagination_page:${values?.page}`;
    }

    if (key === "reviews_filters_rating_option") {
      return `reviews_filters_rating_option:${values?.count}`;
    }

    if (key === "reviews_delete_dialog_target") {
      return `reviews_delete_dialog_target:${values?.name}`;
    }

    return key;
  },
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/hooks/useAdminReviews", () => ({
  useAdminReviews: (...args: unknown[]) => useAdminReviewsMock(...args),
  useToggleAdminReviewVisibilityMutation: () => useToggleAdminReviewVisibilityMutationMock(),
  useModerateAdminReviewMutation: () => useModerateAdminReviewMutationMock(),
  useDeleteAdminReviewMutation: () => useDeleteAdminReviewMutationMock(),
}));

function createDefaultHooks() {
  useAdminReviewsMock.mockReturnValue({
    data: {
      items: [
        {
          id: "review-1",
          bookId: "book-1",
          bookTitle: "Lagos Rising",
          authorName: "Ada Author",
          authorEmail: "ada@example.com",
          rating: 4,
          comment: "Strong writing and polished finish",
          isPublic: false,
          createdAt: "2026-03-19T10:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    },
    items: [
      {
        id: "review-1",
        bookId: "book-1",
        bookTitle: "Lagos Rising",
        authorName: "Ada Author",
        authorEmail: "ada@example.com",
        rating: 4,
        comment: "Strong writing and polished finish",
        isPublic: false,
        createdAt: "2026-03-19T10:00:00.000Z",
      },
    ],
    nextCursor: null,
    hasMore: false,
    isError: false,
    isInitialLoading: false,
    isFetching: false,
    isPageTransitioning: false,
    error: null,
    refetch: jest.fn(),
  });

  useToggleAdminReviewVisibilityMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: toggleMutateAsyncMock.mockResolvedValue({ id: "review-1", isPublic: true }),
  });

  useModerateAdminReviewMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: moderateMutateAsyncMock,
  });

  useDeleteAdminReviewMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: deleteMutateAsyncMock.mockResolvedValue({ id: "review-1", deleted: true }),
  });
}

describe("AdminReviewsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createDefaultHooks();
  });

  it("uses pending visibility as the default filter query", () => {
    render(<AdminReviewsView />);

    expect(useAdminReviewsMock).toHaveBeenCalled();

    const firstCall = useAdminReviewsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall).toEqual(
      expect.objectContaining({
        limit: 20,
        isPublic: false,
        rating: undefined,
      })
    );
  });

  it("renders review star summary for each row", () => {
    render(<AdminReviewsView />);

    expect(screen.getAllByRole("img", { name: "4 out of 5 stars" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("4/5").length).toBeGreaterThan(0);
  });

  it("supports visibility toggle moderation from row actions", async () => {
    const user = userEvent.setup();
    render(<AdminReviewsView />);

    await user.click(screen.getAllByRole("button", { name: "reviews_action_publish" })[0]);

    await waitFor(() => {
      expect(toggleMutateAsyncMock).toHaveBeenCalledWith({
        reviewId: "review-1",
        isPublic: true,
      });
    });
  });

  it("opens delete confirmation and deletes after confirm", async () => {
    const user = userEvent.setup();
    render(<AdminReviewsView />);

    const openMenuButton = screen.getAllByRole("button", { name: "reviews_actions_menu_sr" })[0];
    await user.click(openMenuButton);
    await user.click(screen.getByRole("menuitem", { name: "reviews_action_delete" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "reviews_delete_dialog_confirm" }));

    await waitFor(() => {
      expect(deleteMutateAsyncMock).toHaveBeenCalledWith("review-1");
    });
  });
});
