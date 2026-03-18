import { renderHook } from "@testing-library/react";
import {
  adminCouponsQueryKeys,
  useCreateAdminCouponMutation,
  useDeleteAdminCouponMutation,
  useToggleAdminCouponActiveMutation,
  useUpdateAdminCouponMutation,
} from "./useAdminCoupons";

const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();
const fetchApiV1WithRefreshMock = jest.fn();

jest.mock("@/lib/fetch-with-refresh", () => ({
  fetchApiV1WithRefresh: (...args: unknown[]) => fetchApiV1WithRefreshMock(...args),
}));

jest.mock("@/lib/api-error", () => ({
  throwApiError: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => {
    useMutationMock(options);
    return options;
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
  useQuery: jest.fn(),
}));

type MutationOptionsShape = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess?: (_response: unknown, variables: unknown) => Promise<void>;
};

describe("useAdminCouponActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it("creates a coupon and invalidates admin coupon queries", async () => {
    fetchApiV1WithRefreshMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "coupon_1", code: "SAVE20" }),
    } as unknown as Response);

    renderHook(() => useCreateAdminCouponMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = await options.mutationFn({
      code: "SAVE20",
      discountType: "percentage",
      discountValue: 20,
      maxUses: 100,
      expiresAt: "2026-04-01T00:00:00.000Z",
      isActive: true,
    });

    expect(fetchApiV1WithRefreshMock).toHaveBeenCalledWith(
      "/admin/coupons",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );

    expect(JSON.parse(String(fetchApiV1WithRefreshMock.mock.calls[0]?.[1]?.body))).toEqual({
      code: "SAVE20",
      discountType: "percentage",
      discountValue: 20,
      maxUses: 100,
      expiresAt: "2026-04-01T00:00:00.000Z",
      isActive: true,
    });

    await options.onSuccess?.(result, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminCouponsQueryKeys.all,
    });
  });

  it("creates a fixed coupon payload and invalidates admin coupon queries", async () => {
    fetchApiV1WithRefreshMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "coupon_2", code: "FIXED1500" }),
    } as unknown as Response);

    renderHook(() => useCreateAdminCouponMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = await options.mutationFn({
      code: "FIXED1500",
      discountType: "fixed",
      discountValue: 1500,
      maxUses: null,
      expiresAt: null,
      isActive: true,
    });

    expect(fetchApiV1WithRefreshMock).toHaveBeenCalledWith(
      "/admin/coupons",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );

    expect(JSON.parse(String(fetchApiV1WithRefreshMock.mock.calls[0]?.[1]?.body))).toEqual({
      code: "FIXED1500",
      discountType: "fixed",
      discountValue: 1500,
      maxUses: null,
      expiresAt: null,
      isActive: true,
    });

    await options.onSuccess?.(result, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminCouponsQueryKeys.all,
    });
  });

  it("updates a coupon and invalidates admin coupon queries", async () => {
    fetchApiV1WithRefreshMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "coupon_1", code: "SAVE10" }),
    } as unknown as Response);

    renderHook(() => useUpdateAdminCouponMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = await options.mutationFn({
      couponId: "coupon_1",
      input: {
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
      },
    });

    expect(fetchApiV1WithRefreshMock).toHaveBeenCalledWith(
      "/admin/coupons/coupon_1",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      })
    );

    expect(JSON.parse(String(fetchApiV1WithRefreshMock.mock.calls[0]?.[1]?.body))).toEqual({
      code: "SAVE10",
      discountType: "percentage",
      discountValue: 10,
    });

    await options.onSuccess?.(result, {
      couponId: "coupon_1",
      input: {
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
      },
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminCouponsQueryKeys.all,
    });
  });

  it("toggles active state through patch payload and invalidates queries", async () => {
    fetchApiV1WithRefreshMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "coupon_1", isActive: false }),
    } as unknown as Response);

    renderHook(() => useToggleAdminCouponActiveMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = await options.mutationFn({
      couponId: "coupon_1",
      isActive: false,
    });

    expect(fetchApiV1WithRefreshMock).toHaveBeenCalledWith(
      "/admin/coupons/coupon_1",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      })
    );

    expect(JSON.parse(String(fetchApiV1WithRefreshMock.mock.calls[0]?.[1]?.body))).toEqual({
      isActive: false,
    });

    await options.onSuccess?.(result, {
      couponId: "coupon_1",
      isActive: false,
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminCouponsQueryKeys.all,
    });
  });

  it("deletes a coupon and invalidates admin coupon queries", async () => {
    fetchApiV1WithRefreshMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "coupon_1", deleted: true }),
    } as unknown as Response);

    renderHook(() => useDeleteAdminCouponMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = await options.mutationFn("coupon_1");

    expect(fetchApiV1WithRefreshMock).toHaveBeenCalledWith(
      "/admin/coupons/coupon_1",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
      })
    );

    await options.onSuccess?.(result, "coupon_1");

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminCouponsQueryKeys.all,
    });
  });
});
