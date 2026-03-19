"use client";

import type {
  AdminArchiveOrderInput,
  AdminArchiveOrderResponse,
  AdminRefundRequestInput,
  AdminRefundResponse,
  AdminUpdateOrderStatusInput,
  AdminUpdateOrderStatusResponse,
} from "@bookprinta/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminOrdersQueryKeys } from "./useAdminOrders";

export class AdminOrderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderConflictError";
  }
}

export function isAdminOrderConflictError(error: unknown): error is AdminOrderConflictError {
  return error instanceof AdminOrderConflictError;
}

type UpdateAdminOrderStatusVariables = {
  orderId: string;
  input: AdminUpdateOrderStatusInput;
};

type RefundAdminPaymentVariables = {
  paymentId: string;
  input: AdminRefundRequestInput;
};

type ArchiveAdminOrderVariables = {
  orderId: string;
  input: AdminArchiveOrderInput;
};

async function updateAdminOrderStatus({
  orderId,
  input,
}: UpdateAdminOrderStatusVariables): Promise<AdminUpdateOrderStatusResponse> {
  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/admin/orders/${orderId}/status`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to update the order status right now.");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
      error?: { message?: string };
    } | null;
    const message =
      (typeof payload?.error?.message === "string" && payload.error.message) ||
      (typeof payload?.message === "string" && payload.message) ||
      (Array.isArray(payload?.message) && payload.message.join(", ")) ||
      "Unable to update the order status";

    if (response.status === 409) {
      throw new AdminOrderConflictError(message);
    }

    throw new Error(message);
  }

  return (await response.json()) as AdminUpdateOrderStatusResponse;
}

async function refundAdminPayment({
  paymentId,
  input,
}: RefundAdminPaymentVariables): Promise<AdminRefundResponse> {
  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/admin/payments/${paymentId}/refund`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to process the refund right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to process the refund");
  }

  return (await response.json()) as AdminRefundResponse;
}

async function archiveAdminOrder({
  orderId,
  input,
}: ArchiveAdminOrderVariables): Promise<AdminArchiveOrderResponse> {
  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/admin/orders/${orderId}/archive`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to archive the order right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to archive the order");
  }

  return (await response.json()) as AdminArchiveOrderResponse;
}

export function useAdminOrderStatusMutation(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminUpdateOrderStatusInput) =>
      updateAdminOrderStatus({
        orderId,
        input,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminOrdersQueryKeys.detail(orderId),
        }),
        queryClient.invalidateQueries({
          queryKey: adminOrdersQueryKeys.all,
        }),
      ]);
    },
  });
}

export function useAdminRefundMutation(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId, input }: RefundAdminPaymentVariables) =>
      refundAdminPayment({
        paymentId,
        input,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminOrdersQueryKeys.detail(orderId),
        }),
        queryClient.invalidateQueries({
          queryKey: adminOrdersQueryKeys.all,
        }),
      ]);
    },
  });
}

export function useAdminArchiveOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, input }: ArchiveAdminOrderVariables) =>
      archiveAdminOrder({ orderId, input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminOrdersQueryKeys.all,
      });
    },
  });
}
