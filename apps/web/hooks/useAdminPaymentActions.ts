"use client";

import type {
  AdminRefundRequestInput,
  AdminRefundResponse,
  PaymentStatus,
} from "@bookprinta/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminOrdersQueryKeys } from "./useAdminOrders";
import { adminPaymentsQueryKeys } from "./useAdminPayments";

export type AdminBankTransferDecisionResponse = {
  id: string;
  status: PaymentStatus;
  message: string;
};

export const ADMIN_PAYMENT_APPROVE_ACTION_TEXT = {
  label: "Approve & send registration link",
  description: "Approving this bank transfer also sends the customer's unique registration link.",
  pendingLabel: "Approving & sending registration link",
} as const;

export const ADMIN_PAYMENT_REJECT_ACTION_TEXT = {
  disabledReason: "Add a rejection reason before rejecting this transfer.",
} as const;

type ApproveAdminPaymentVariables = {
  paymentId: string;
  orderId?: string | null;
  adminNote?: string;
};

type RejectAdminPaymentVariables = {
  paymentId: string;
  orderId?: string | null;
  adminNote: string;
};

type RefundAdminPaymentVariables = {
  paymentId: string;
  orderId?: string | null;
  input: AdminRefundRequestInput;
};

function buildJsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

function createInvalidationTargets(orderId?: string | null) {
  return [
    {
      queryKey: adminPaymentsQueryKeys.all,
    },
    {
      queryKey: adminOrdersQueryKeys.all,
    },
    ...(orderId
      ? [
          {
            queryKey: adminOrdersQueryKeys.detail(orderId),
          },
        ]
      : []),
  ] as const;
}

async function invalidateAdminPaymentRelatedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId?: string | null
) {
  const targets = createInvalidationTargets(orderId);

  await Promise.all(
    targets.map((target) =>
      queryClient.invalidateQueries({
        queryKey: target.queryKey,
      })
    )
  );
}

async function approveAdminBankTransfer({
  paymentId,
  adminNote,
}: ApproveAdminPaymentVariables): Promise<AdminBankTransferDecisionResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/payments/${encodeURIComponent(paymentId)}/approve-transfer`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: buildJsonHeaders(),
        body: JSON.stringify({
          ...(adminNote?.trim() ? { adminNote: adminNote.trim() } : {}),
        }),
      }
    );
  } catch {
    throw new Error("Unable to approve the bank transfer right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to approve the bank transfer");
  }

  return (await response.json()) as AdminBankTransferDecisionResponse;
}

async function rejectAdminBankTransfer({
  paymentId,
  adminNote,
}: RejectAdminPaymentVariables): Promise<AdminBankTransferDecisionResponse> {
  const normalizedAdminNote = adminNote.trim();
  if (!normalizedAdminNote) {
    throw new Error(ADMIN_PAYMENT_REJECT_ACTION_TEXT.disabledReason);
  }

  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/payments/${encodeURIComponent(paymentId)}/reject-transfer`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: buildJsonHeaders(),
        body: JSON.stringify({
          adminNote: normalizedAdminNote,
        }),
      }
    );
  } catch {
    throw new Error("Unable to reject the bank transfer right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to reject the bank transfer");
  }

  return (await response.json()) as AdminBankTransferDecisionResponse;
}

async function refundAdminPayment({
  paymentId,
  input,
}: RefundAdminPaymentVariables): Promise<AdminRefundResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/payments/${encodeURIComponent(paymentId)}/refund`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: buildJsonHeaders(),
        body: JSON.stringify(input),
      }
    );
  } catch {
    throw new Error("Unable to process the refund right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to process the refund");
  }

  return (await response.json()) as AdminRefundResponse;
}

export function isAdminPaymentRejectionReasonValid(reason: string): boolean {
  return reason.trim().length > 0;
}

export function getAdminPaymentRejectActionState(reason: string) {
  const canSubmit = isAdminPaymentRejectionReasonValid(reason);

  return {
    canSubmit,
    normalizedReason: reason.trim(),
    disabledReason: canSubmit ? null : ADMIN_PAYMENT_REJECT_ACTION_TEXT.disabledReason,
  };
}

export function useAdminApproveBankTransferMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: ApproveAdminPaymentVariables) => approveAdminBankTransfer(variables),
    onSuccess: async (_response, variables) => {
      await invalidateAdminPaymentRelatedQueries(queryClient, variables.orderId);
    },
  });
}

export function useAdminRejectBankTransferMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RejectAdminPaymentVariables) => rejectAdminBankTransfer(variables),
    onSuccess: async (_response, variables) => {
      await invalidateAdminPaymentRelatedQueries(queryClient, variables.orderId);
    },
  });
}

export function useAdminPaymentRefundMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RefundAdminPaymentVariables) => refundAdminPayment(variables),
    onSuccess: async (_response, variables) => {
      await invalidateAdminPaymentRelatedQueries(queryClient, variables.orderId);
    },
  });
}
