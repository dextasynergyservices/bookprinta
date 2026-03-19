import { renderHook } from "@testing-library/react";
import {
  AdminOrderConflictError,
  isAdminOrderConflictError,
  useAdminOrderStatusMutation,
} from "./useAdminOrderActions";
import { adminOrdersQueryKeys } from "./useAdminOrders";

const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();

jest.mock("./useAdminOrders", () => ({
  adminOrdersQueryKeys: {
    all: ["admin", "orders"],
    detail: (orderId: string) => ["admin", "orders", "detail", orderId],
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
  onSuccess?: () => Promise<void>;
};

describe("useAdminOrderActions", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it("maps 409 response to AdminOrderConflictError", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: jest.fn().mockResolvedValue({
        message: "Order was updated by another admin. Refresh and try again.",
      }),
    } as unknown as Response);

    renderHook(() => useAdminOrderStatusMutation("cm_order_1"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await expect(
      options.mutationFn({
        nextStatus: "PRINTING",
        expectedVersion: 2,
      })
    ).rejects.toBeInstanceOf(AdminOrderConflictError);
  });

  it("maps non-409 error responses to plain Error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({
        message: "Invalid status transition",
      }),
    } as unknown as Response);

    renderHook(() => useAdminOrderStatusMutation("cm_order_1"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await expect(
      options.mutationFn({
        nextStatus: "PRINTING",
        expectedVersion: 2,
      })
    ).rejects.toThrow("Invalid status transition");

    await expect(
      options.mutationFn({
        nextStatus: "PRINTING",
        expectedVersion: 2,
      })
    ).rejects.not.toBeInstanceOf(AdminOrderConflictError);
  });

  it("throws a generic message when fetch fails entirely", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network error"));

    renderHook(() => useAdminOrderStatusMutation("cm_order_1"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await expect(
      options.mutationFn({
        nextStatus: "PRINTING",
        expectedVersion: 2,
      })
    ).rejects.toThrow("Unable to update the order status right now.");
  });

  it("invalidates order queries on successful status update", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ orderId: "cm_order_1" }),
    } as unknown as Response);

    renderHook(() => useAdminOrderStatusMutation("cm_order_1"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await options.onSuccess?.();

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminOrdersQueryKeys.detail("cm_order_1"),
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminOrdersQueryKeys.all,
    });
  });

  describe("isAdminOrderConflictError", () => {
    it("returns true for AdminOrderConflictError instances", () => {
      expect(isAdminOrderConflictError(new AdminOrderConflictError("conflict"))).toBe(true);
    });

    it("returns false for plain Error instances", () => {
      expect(isAdminOrderConflictError(new Error("not a conflict"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isAdminOrderConflictError(null)).toBe(false);
      expect(isAdminOrderConflictError("string")).toBe(false);
    });
  });
});
