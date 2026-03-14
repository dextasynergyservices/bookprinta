import { renderHook } from "@testing-library/react";
import { useAdminUserDetail } from "./useAdminUserDetail";

const useQueryMock = jest.fn();

jest.mock("./useAdminUsers", () => ({
  adminUsersQueryKeys: {
    all: ["admin", "users"],
    detail: (userId: string) => ["admin", "users", "detail", userId],
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled: boolean;
};

describe("useAdminUserDetail query options", () => {
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

  it("enables the remote query when a user id is provided", () => {
    const userId = "cm1111111111111111111111111";
    renderHook(() => useAdminUserDetail({ userId }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(["admin", "users", "detail", userId]);
    expect(options.enabled).toBe(true);
  });

  it("disables the remote query and returns null user data when the id is missing", () => {
    const { result } = renderHook(() => useAdminUserDetail({ userId: null }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(["admin", "users", "detail", ""]);
    expect(options.enabled).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.data).toBeNull();
  });
});
