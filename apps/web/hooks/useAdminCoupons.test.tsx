import { renderHook } from "@testing-library/react";
import { adminCouponsQueryKeys, useAdminCoupons } from "./useAdminCoupons";

const useQueryMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  staleTime?: number;
  gcTime?: number;
  retry?: number;
};

describe("useAdminCoupons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: [
        {
          id: "coupon_1",
          code: "SAVE20",
          discountType: "percentage",
          discountValue: 20,
          maxUses: 100,
          currentUses: 12,
          expiresAt: "2026-04-01T00:00:00.000Z",
          isActive: true,
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
      ],
      isPending: false,
      error: null,
    });
  });

  it("uses the admin coupons list query key and expected cache options", () => {
    const { result } = renderHook(() => useAdminCoupons());

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.queryKey).toEqual(adminCouponsQueryKeys.list());
    expect(options.staleTime).toBe(30_000);
    expect(options.gcTime).toBe(1000 * 60 * 10);
    expect(options.retry).toBe(1);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.isInitialLoading).toBe(false);
  });

  it("returns a safe empty array while initial loading is pending", () => {
    useQueryMock.mockReturnValueOnce({
      data: undefined,
      isPending: true,
      error: null,
    });

    const { result } = renderHook(() => useAdminCoupons());

    expect(result.current.data).toEqual([]);
    expect(result.current.items).toEqual([]);
    expect(result.current.isInitialLoading).toBe(true);
  });
});
