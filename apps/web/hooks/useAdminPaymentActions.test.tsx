import { renderHook } from "@testing-library/react";
import { adminOrdersQueryKeys } from "./useAdminOrders";
import {
  ADMIN_PAYMENT_APPROVE_ACTION_TEXT,
  ADMIN_PAYMENT_REJECT_ACTION_TEXT,
  getAdminPaymentRejectActionState,
  useAdminApproveBankTransferMutation,
  useAdminPaymentRefundMutation,
  useAdminRejectBankTransferMutation,
} from "./useAdminPaymentActions";
import { adminPaymentsQueryKeys } from "./useAdminPayments";

const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();

jest.mock("./useAdminOrders", () => ({
  adminOrdersQueryKeys: {
    all: ["admin", "orders"],
    detail: (orderId: string) => ["admin", "orders", "detail", orderId],
  },
}));

jest.mock("./useAdminPayments", () => ({
  adminPaymentsQueryKeys: {
    all: ["admin", "payments"],
    pending: () => ["admin", "payments", "pending-bank-transfers"],
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
  onSuccess?: (_response: unknown, variables: unknown) => Promise<void>;
};

describe("useAdminPaymentActions", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it("keeps the approve action copy explicit about sending the registration link", () => {
    expect(ADMIN_PAYMENT_APPROVE_ACTION_TEXT.label).toContain("send registration link");
    expect(ADMIN_PAYMENT_APPROVE_ACTION_TEXT.description).toContain("unique registration link");
  });

  it("exposes rejection readiness so the UI can stay disabled until a reason is provided", () => {
    expect(getAdminPaymentRejectActionState("   ")).toEqual({
      canSubmit: false,
      normalizedReason: "",
      disabledReason: ADMIN_PAYMENT_REJECT_ACTION_TEXT.disabledReason,
    });

    expect(getAdminPaymentRejectActionState("Duplicate receipt")).toEqual({
      canSubmit: true,
      normalizedReason: "Duplicate receipt",
      disabledReason: null,
    });
  });

  it("approves bank transfers and invalidates payment and order queries", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "SUCCESS",
        message: "Bank transfer approved successfully.",
      }),
    } as unknown as Response);

    renderHook(() => useAdminApproveBankTransferMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = (await options.mutationFn({
      paymentId: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      adminNote: "Receipt confirmed",
    })) as { status: string };

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/admin/payments/cm1111111111111111111111111/approve-transfer"
      ),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      adminNote: "Receipt confirmed",
    });
    expect(result.status).toBe("SUCCESS");

    await options.onSuccess?.(result, {
      paymentId: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminPaymentsQueryKeys.all,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminOrdersQueryKeys.all,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminOrdersQueryKeys.detail("cm2222222222222222222222222"),
    });
  });

  it("rejects bank transfers and trims the required admin note", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "FAILED",
        message: "Bank transfer rejected.",
      }),
    } as unknown as Response);

    renderHook(() => useAdminRejectBankTransferMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = (await options.mutationFn({
      paymentId: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      adminNote: "  Invalid receipt  ",
    })) as { status: string };

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      adminNote: "Invalid receipt",
    });
    expect(result.status).toBe("FAILED");
  });

  it("submits refunds from a payment row and invalidates payment and order queries", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        orderId: "cm2222222222222222222222222",
        paymentId: "cm1111111111111111111111111",
        refundPaymentId: "cm3333333333333333333333333",
        provider: "BANK_TRANSFER",
        processingMode: "manual",
        refundType: "FULL",
        refundedAmount: 50000,
        currency: "NGN",
        paymentStatus: "REFUNDED",
        providerRefundReference: null,
        orderStatus: "REFUNDED",
        bookStatus: null,
        refundedAt: "2026-03-13T11:00:00.000Z",
        refundReason: "Duplicate payment",
        orderVersion: 4,
        bookVersion: null,
        emailSent: true,
        policySnapshot: {
          calculatedAt: "2026-03-13T10:59:00.000Z",
          statusSource: "order",
          stage: "PENDING_PAYMENT_APPROVAL",
          stageLabel: "Pending payment approval",
          eligible: true,
          policyDecision: "REFUNDED",
          allowedRefundTypes: ["FULL"],
          recommendedRefundType: "FULL",
          orderTotalAmount: 50000,
          recommendedAmount: 50000,
          maxRefundAmount: 50000,
          policyPercent: 100,
          policyMessage: "Manual refund allowed.",
        },
        audit: {
          auditId: "cm4444444444444444444444444",
          action: "ADMIN_PAYMENT_REFUNDED",
          entityType: "PAYMENT",
          entityId: "cm1111111111111111111111111",
          recordedAt: "2026-03-13T11:00:00.000Z",
          recordedBy: "cm5555555555555555555555555",
          note: null,
          reason: "Duplicate payment",
        },
      }),
    } as unknown as Response);

    renderHook(() => useAdminPaymentRefundMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = await options.mutationFn({
      paymentId: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      input: {
        type: "FULL",
        reason: "Duplicate payment",
        expectedOrderVersion: 4,
        policySnapshot: {
          calculatedAt: "2026-03-13T10:59:00.000Z",
          statusSource: "order",
          stage: "PENDING_PAYMENT_APPROVAL",
          stageLabel: "Pending payment approval",
          eligible: true,
          policyDecision: "REFUNDED",
          allowedRefundTypes: ["FULL"],
          recommendedRefundType: "FULL",
          orderTotalAmount: 50000,
          recommendedAmount: 50000,
          maxRefundAmount: 50000,
          policyPercent: 100,
          policyMessage: "Manual refund allowed.",
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/payments/cm1111111111111111111111111/refund"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );

    await options.onSuccess?.(result, {
      paymentId: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminPaymentsQueryKeys.all,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminOrdersQueryKeys.all,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminOrdersQueryKeys.detail("cm2222222222222222222222222"),
    });
  });
});
