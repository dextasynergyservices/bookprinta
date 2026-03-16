import { renderHook } from "@testing-library/react";
import { useAdminUpdateUserMutation } from "./useAdminUserActions";
import { adminUsersQueryKeys } from "./useAdminUsers";

const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();

jest.mock("./useAdminUsers", () => ({
  adminUsersQueryKeys: {
    all: ["admin", "users"],
    detail: (userId: string) => ["admin", "users", "detail", userId],
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => {
    useMutationMock(options);
    return options;
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

type MutationOptionsShape = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess?: (_response: unknown, variables: { userId: string }) => Promise<void>;
};

describe("useAdminUserActions", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it("updates a user and invalidates the admin users list and detail queries", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        userId: "cm1111111111111111111111111",
        previousState: {
          role: "USER",
          isVerified: false,
          isActive: true,
        },
        currentState: {
          role: "EDITOR",
          isVerified: true,
          isActive: true,
        },
        updatedAt: "2026-03-14T12:00:00.000Z",
        audit: {
          auditId: "cmaudit_1",
          action: "ADMIN_USER_ROLE_UPDATED",
          entityType: "USER",
          entityId: "cm1111111111111111111111111",
          recordedAt: "2026-03-14T12:00:01.000Z",
          recordedBy: "cmadmin_1",
          note: null,
          reason: null,
        },
      }),
    } as unknown as Response);

    renderHook(() => useAdminUpdateUserMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = await options.mutationFn({
      userId: "cm1111111111111111111111111",
      input: {
        role: "EDITOR",
        isVerified: true,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/users/cm1111111111111111111111111"),
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      role: "EDITOR",
      isVerified: true,
    });

    await options.onSuccess?.(result, {
      userId: "cm1111111111111111111111111",
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminUsersQueryKeys.all,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminUsersQueryKeys.detail("cm1111111111111111111111111"),
    });
  });
});
