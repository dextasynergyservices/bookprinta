"use client";

import type {
  AdminRefundRequestInput,
  AdminRefundResponse,
  AdminUpdateOrderStatusInput,
  AdminUpdateOrderStatusResponse,
} from "@bookprinta/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { adminOrdersQueryKeys } from "./useAdminOrders";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

type UpdateAdminOrderStatusVariables = {
  orderId: string;
  input: AdminUpdateOrderStatusInput;
};

type RefundAdminPaymentVariables = {
  paymentId: string;
  input: AdminRefundRequestInput;
};

async function updateAdminOrderStatus({
  orderId,
  input,
}: UpdateAdminOrderStatusVariables): Promise<AdminUpdateOrderStatusResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_V1_BASE_URL}/admin/orders/${orderId}/status`, {
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
    await throwApiError(response, "Unable to update the order status");
  }

  return (await response.json()) as AdminUpdateOrderStatusResponse;
}

async function refundAdminPayment({
  paymentId,
  input,
}: RefundAdminPaymentVariables): Promise<AdminRefundResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_V1_BASE_URL}/admin/payments/${paymentId}/refund`, {
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
