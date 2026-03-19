import { renderHook } from "@testing-library/react";
import {
  adminReviewsQueryKeys,
  useAdminReviews,
  useDeleteAdminReviewMutation,
  useToggleAdminReviewVisibilityMutation,
} from "./useAdminReviews";

const useQueryMock = jest.fn();
const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();

jest.mock("@/lib/api/admin-reviews", () => ({
  fetchAdminReviews: jest.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  }),
  updateAdminReview: jest.fn().mockResolvedValue({
    id: "review-1",
    bookId: "book-1",
    bookTitle: "Example Book",
    authorName: "A. Author",
    authorEmail: "author@example.com",
    rating: 4,
    comment: "Great",
    isPublic: true,
    createdAt: "2026-03-19T12:00:00.000Z",
  }),
  deleteAdminReview: jest.fn().mockResolvedValue({ id: "review-1", deleted: true }),
}));

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
  useMutation: (options: unknown) => {
    useMutationMock(options);
    return options;
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

type QueryOptionsShape = {
  queryKey: unknown;
};

type MutationOptionsShape = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess?: (_data: unknown, _variables: unknown) => Promise<void>;
};

describe("useAdminReviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateQueriesMock.mockResolvedValue(undefined);
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: "review-1",
            bookId: "book-1",
            bookTitle: "Example Book",
            authorName: "A. Author",
            authorEmail: "author@example.com",
            rating: 5,
            comment: "Excellent",
            isPublic: false,
            createdAt: "2026-03-19T12:00:00.000Z",
          },
        ],
        nextCursor: "review-2",
        hasMore: true,
      },
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
    });
  });

  it("builds a normalized query key for admin reviews list", () => {
    const { result } = renderHook(() =>
      useAdminReviews({
        cursor: " review-1 ",
        limit: 20,
        q: "  lagos  ",
        isPublic: false,
        rating: 4,
      })
    );

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(
      adminReviewsQueryKeys.reviewList({
        cursor: "review-1",
        limit: 20,
        q: "lagos",
        isPublic: "false",
        rating: "4",
      })
    );

    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
  });

  it("invalidates admin review queries after visibility toggle mutation", async () => {
    renderHook(() => useToggleAdminReviewVisibilityMutation());

    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;
    const payload = {
      reviewId: "review-1",
      isPublic: true,
    };

    const response = await options.mutationFn(payload);
    await options.onSuccess?.(response, payload);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminReviewsQueryKeys.all,
    });
  });

  it("invalidates admin review queries after delete mutation", async () => {
    renderHook(() => useDeleteAdminReviewMutation());

    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;
    const response = await options.mutationFn("review-1");
    await options.onSuccess?.(response, "review-1");

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminReviewsQueryKeys.all,
    });
  });
});
