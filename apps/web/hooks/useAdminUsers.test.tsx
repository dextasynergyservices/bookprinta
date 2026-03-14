import { renderHook } from "@testing-library/react";
import { adminUsersQueryKeys, useAdminUsers } from "./useAdminUsers";

const useQueryMock = jest.fn();

jest.mock("./use-admin-users-filters", () => ({
  ADMIN_USERS_LIMIT: 20,
  DEFAULT_ADMIN_USER_SORT_BY: "createdAt",
  DEFAULT_ADMIN_USER_SORT_DIRECTION: "desc",
}));

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
};

describe("useAdminUsers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: "cm1111111111111111111111111",
            fullName: "Ada Okafor",
            email: "ada@example.com",
            role: "EDITOR",
            isVerified: true,
            isActive: true,
            createdAt: "2026-03-14T10:00:00.000Z",
            detailUrl: "/admin/users/cm1111111111111111111111111",
          },
        ],
        nextCursor: "cm2222222222222222222222222",
        hasMore: true,
        totalItems: 42,
        limit: 20,
        sortBy: "createdAt",
        sortDirection: "desc",
        sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
      },
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
    });
  });

  it("uses the admin users list query key with normalized filters", () => {
    const { result } = renderHook(() =>
      useAdminUsers({
        cursor: " cursor_1 ",
        q: " Ada ",
        role: "EDITOR",
        isVerified: true,
      })
    );

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(
      adminUsersQueryKeys.list({
        cursor: "cursor_1",
        limit: 20,
        q: "Ada",
        role: "EDITOR",
        isVerified: true,
        sortBy: "createdAt",
        sortDirection: "desc",
      })
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.isInitialLoading).toBe(false);
  });

  it("returns a safe empty response while the first request is pending", () => {
    useQueryMock.mockReturnValueOnce({
      data: undefined,
      isPending: true,
      isFetching: false,
      isPlaceholderData: false,
    });

    const { result } = renderHook(() => useAdminUsers({}));

    expect(result.current.data).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
      totalItems: 0,
      limit: 20,
      sortBy: "createdAt",
      sortDirection: "desc",
      sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
    });
    expect(result.current.isInitialLoading).toBe(true);
  });
});
