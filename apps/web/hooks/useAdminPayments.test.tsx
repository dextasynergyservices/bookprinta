import { act, renderHook } from "@testing-library/react";
import {
  ADMIN_PENDING_BANK_TRANSFER_SLA_GREEN_MINUTES,
  ADMIN_PENDING_BANK_TRANSFER_SLA_RED_MINUTES,
  adminPaymentsQueryKeys,
  derivePendingBankTransferLiveSla,
  PENDING_BANK_TRANSFER_REFETCH_INTERVAL_MS,
  usePendingBankTransfers,
} from "./useAdminPayments";

const useQueryMock = jest.fn();

jest.mock("./use-admin-payments-filters", () => ({
  ADMIN_PAYMENTS_LIMIT: 20,
  DEFAULT_ADMIN_PAYMENT_SORT_BY: "createdAt",
  DEFAULT_ADMIN_PAYMENT_SORT_DIRECTION: "desc",
}));

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: "always" | false;
};

describe("useAdminPayments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-13T10:15:00.000Z"));
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: "cm1111111111111111111111111",
            orderReference: "BP-REF-001",
            orderNumber: "BP-1001",
            orderId: "cm2222222222222222222222222",
            userId: "cm3333333333333333333333333",
            customer: {
              fullName: "Ada Lovelace",
              email: "ada@example.com",
              phoneNumber: "+2348000000000",
              preferredLanguage: "en",
            },
            provider: "BANK_TRANSFER",
            type: "INITIAL",
            status: "AWAITING_APPROVAL",
            amount: 50000,
            currency: "NGN",
            providerRef: "ref_1",
            receiptUrl: "https://example.com/receipt.jpg",
            payerName: "Ada Lovelace",
            payerEmail: "ada@example.com",
            payerPhone: "+2348000000000",
            adminNote: null,
            hasAdminNote: false,
            approvedAt: null,
            approvedBy: null,
            processedAt: null,
            createdAt: "2026-03-13T10:00:00.000Z",
            updatedAt: "2026-03-13T10:00:00.000Z",
            refundability: {
              isRefundable: false,
              processingMode: "manual",
              reason: "Pending approval",
              policySnapshot: null,
              orderVersion: null,
              bookVersion: null,
            },
            slaSnapshot: {
              ageMinutes: 15,
              state: "yellow",
            },
          },
        ],
        totalItems: 1,
        refreshedAt: "2026-03-13T10:15:00.000Z",
      },
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("uses the pending bank transfers endpoint with 60-second polling", () => {
    renderHook(() => usePendingBankTransfers());

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(adminPaymentsQueryKeys.pending());
    expect(options.refetchInterval).toBe(PENDING_BANK_TRANSFER_REFETCH_INTERVAL_MS);
    expect(options.refetchIntervalInBackground).toBe(true);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchOnMount).toBe("always");
  });

  it("derives SLA colors at the documented thresholds", () => {
    expect(
      derivePendingBankTransferLiveSla(
        {
          createdAt: "2026-03-13T10:01:00.000Z",
        },
        new Date("2026-03-13T10:15:00.000Z").getTime()
      ).state
    ).toBe("green");

    expect(
      derivePendingBankTransferLiveSla(
        {
          createdAt: "2026-03-13T10:00:00.000Z",
        },
        new Date("2026-03-13T10:15:00.000Z").getTime()
      ).state
    ).toBe("yellow");

    expect(
      derivePendingBankTransferLiveSla(
        {
          createdAt: "2026-03-13T09:45:00.000Z",
        },
        new Date("2026-03-13T10:15:00.000Z").getTime()
      ).state
    ).toBe("red");

    expect(ADMIN_PENDING_BANK_TRANSFER_SLA_GREEN_MINUTES).toBe(15);
    expect(ADMIN_PENDING_BANK_TRANSFER_SLA_RED_MINUTES).toBe(30);
  });

  it("sorts pending bank transfers oldest first before exposing them to the dashboard", () => {
    useQueryMock.mockReturnValueOnce({
      data: {
        items: [
          {
            id: "payment_newest",
            orderReference: "BP-REF-003",
            orderNumber: "BP-1003",
            orderId: "cm4444444444444444444444444",
            userId: "cm4444444444444444444444445",
            customer: {
              fullName: "Newest Author",
              email: "newest@example.com",
              phoneNumber: "+2348000000002",
              preferredLanguage: "en",
            },
            provider: "BANK_TRANSFER",
            type: "INITIAL",
            status: "AWAITING_APPROVAL",
            amount: 50000,
            currency: "NGN",
            providerRef: "ref_3",
            receiptUrl: "https://example.com/receipt-3.jpg",
            payerName: "Newest Author",
            payerEmail: "newest@example.com",
            payerPhone: "+2348000000002",
            adminNote: null,
            hasAdminNote: false,
            approvedAt: null,
            approvedBy: null,
            processedAt: null,
            createdAt: "2026-03-13T10:12:00.000Z",
            updatedAt: "2026-03-13T10:12:00.000Z",
            refundability: {
              isRefundable: false,
              processingMode: "manual",
              reason: "Pending approval",
              policySnapshot: null,
              orderVersion: null,
              bookVersion: null,
            },
            slaSnapshot: {
              ageMinutes: 3,
              state: "green",
            },
          },
          {
            id: "payment_oldest",
            orderReference: "BP-REF-001",
            orderNumber: "BP-1001",
            orderId: "cm2222222222222222222222222",
            userId: "cm3333333333333333333333333",
            customer: {
              fullName: "Oldest Author",
              email: "oldest@example.com",
              phoneNumber: "+2348000000000",
              preferredLanguage: "en",
            },
            provider: "BANK_TRANSFER",
            type: "INITIAL",
            status: "AWAITING_APPROVAL",
            amount: 50000,
            currency: "NGN",
            providerRef: "ref_1",
            receiptUrl: "https://example.com/receipt-1.jpg",
            payerName: "Oldest Author",
            payerEmail: "oldest@example.com",
            payerPhone: "+2348000000000",
            adminNote: null,
            hasAdminNote: false,
            approvedAt: null,
            approvedBy: null,
            processedAt: null,
            createdAt: "2026-03-13T09:30:00.000Z",
            updatedAt: "2026-03-13T09:30:00.000Z",
            refundability: {
              isRefundable: false,
              processingMode: "manual",
              reason: "Pending approval",
              policySnapshot: null,
              orderVersion: null,
              bookVersion: null,
            },
            slaSnapshot: {
              ageMinutes: 45,
              state: "red",
            },
          },
          {
            id: "payment_middle",
            orderReference: "BP-REF-002",
            orderNumber: "BP-1002",
            orderId: "cm3333333333333333333333334",
            userId: "cm3333333333333333333333335",
            customer: {
              fullName: "Middle Author",
              email: "middle@example.com",
              phoneNumber: "+2348000000001",
              preferredLanguage: "en",
            },
            provider: "BANK_TRANSFER",
            type: "INITIAL",
            status: "AWAITING_APPROVAL",
            amount: 50000,
            currency: "NGN",
            providerRef: "ref_2",
            receiptUrl: "https://example.com/receipt-2.jpg",
            payerName: "Middle Author",
            payerEmail: "middle@example.com",
            payerPhone: "+2348000000001",
            adminNote: null,
            hasAdminNote: false,
            approvedAt: null,
            approvedBy: null,
            processedAt: null,
            createdAt: "2026-03-13T10:00:00.000Z",
            updatedAt: "2026-03-13T10:00:00.000Z",
            refundability: {
              isRefundable: false,
              processingMode: "manual",
              reason: "Pending approval",
              policySnapshot: null,
              orderVersion: null,
              bookVersion: null,
            },
            slaSnapshot: {
              ageMinutes: 15,
              state: "yellow",
            },
          },
        ],
        totalItems: 3,
        refreshedAt: "2026-03-13T10:15:00.000Z",
      },
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
    });

    const { result } = renderHook(() => usePendingBankTransfers());

    expect(result.current.items.map((item) => item.id)).toEqual([
      "payment_oldest",
      "payment_middle",
      "payment_newest",
    ]);
  });

  it("updates the local waiting timer every 60 seconds using createdAt", () => {
    const { result } = renderHook(() => usePendingBankTransfers());

    expect(result.current.items[0]?.liveSla.ageMinutes).toBe(15);
    expect(result.current.items[0]?.liveSla.label).toBe("15m");

    act(() => {
      jest.advanceTimersByTime(PENDING_BANK_TRANSFER_REFETCH_INTERVAL_MS);
    });

    expect(result.current.items[0]?.liveSla.ageMinutes).toBe(16);
    expect(result.current.items[0]?.liveSla.label).toBe("16m");
  });
});
