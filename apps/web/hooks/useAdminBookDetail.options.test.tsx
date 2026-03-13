import { renderHook } from "@testing-library/react";
import { useAdminBookDetail } from "./useAdminBookDetail";

const useQueryMock = jest.fn();

jest.mock("./useAdminBooks", () => ({
  adminBooksQueryKeys: {
    all: ["admin", "books"],
    detail: (bookId: string) => ["admin", "books", "detail", bookId],
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled: boolean;
};

describe("useAdminBookDetail query options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("enables the remote query when a book id is provided", () => {
    const bookId = "cm1111111111111111111111111";
    renderHook(() => useAdminBookDetail({ bookId }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(["admin", "books", "detail", bookId]);
    expect(options.enabled).toBe(true);
  });

  it("disables the remote query and returns null book data when the id is missing", () => {
    const { result } = renderHook(() => useAdminBookDetail({ bookId: null }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(["admin", "books", "detail", ""]);
    expect(options.enabled).toBe(false);
    expect(result.current.book).toBeNull();
    expect(result.current.data).toBeNull();
  });
});
