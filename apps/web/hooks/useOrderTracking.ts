"use client";

import { useQuery } from "@tanstack/react-query";
import { normalizeBookProgressPayload } from "@/lib/api/book-progress-contract";
import { throwApiError } from "@/lib/api-error";
import { dashboardStatusPollingQueryOptions } from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import {
  BOOK_PROGRESS_STAGES,
  type BookProcessingState,
  type BookProgressNormalizedResponse,
  type BookRolloutState,
} from "@/types/book-progress";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveOrderId(orderId: string | null | undefined): string | null {
  if (typeof orderId !== "string") return null;
  const normalized = orderId.trim();
  return normalized.length > 0 ? normalized : null;
}

type OrderTrackingNormalizedResponse = BookProgressNormalizedResponse & {
  orderId: string;
  orderNumber: string | null;
  trackingNumber: string | null;
  shippingProvider: string | null;
  currentOrderStatus: string | null;
  currentBookStatus: string | null;
};

function createFallbackRollout(): BookRolloutState {
  return {
    environment: "unknown",
    allowInFlightAccess: true,
    isGrandfathered: false,
    blockedBy: null,
    workspace: { enabled: true, access: "enabled" },
    manuscriptPipeline: { enabled: true, access: "enabled" },
    billingGate: { enabled: true, access: "enabled" },
    finalPdf: { enabled: true, access: "enabled" },
  };
}

function createFallbackProcessing(): BookProcessingState {
  return {
    isActive: false,
    currentStep: null,
    jobStatus: null,
    trigger: null,
    startedAt: null,
    attempt: null,
    maxAttempts: null,
  };
}

function createFallbackOrderTracking(orderId: string | null): OrderTrackingNormalizedResponse {
  return {
    sourceEndpoint: "orders_tracking",
    orderId: orderId ?? "",
    orderNumber: null,
    trackingNumber: null,
    shippingProvider: null,
    currentOrderStatus: null,
    currentBookStatus: null,
    bookId: null,
    currentStatus: null,
    productionStatus: "PAYMENT_RECEIVED",
    latestProcessingError: null,
    rejectionReason: null,
    currentStage: "PAYMENT_RECEIVED",
    isRejected: false,
    timeline: BOOK_PROGRESS_STAGES.map((stage, index) => ({
      stage,
      state: index === 0 ? "current" : "upcoming",
      reachedAt: null,
      sourceStatus: null,
    })),
    title: null,
    coverImageUrl: null,
    pageCount: null,
    wordCount: null,
    estimatedPages: null,
    fontFamily: null,
    fontSize: null,
    pageSize: null,
    currentHtmlUrl: null,
    previewPdfUrl: null,
    finalPdfUrl: null,
    updatedAt: null,
    rollout: createFallbackRollout(),
    processing: createFallbackProcessing(),
  };
}

export const orderTrackingQueryKeys = {
  all: ["order-tracking"] as const,
  detail: (orderId: string) => ["order-tracking", "detail", orderId] as const,
};

type FetchOrderTrackingParams = {
  orderId: string;
  signal?: AbortSignal;
};

export async function fetchOrderTracking({
  orderId: requestedOrderId,
  signal,
}: FetchOrderTrackingParams): Promise<OrderTrackingNormalizedResponse> {
  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/orders/${requestedOrderId}/tracking`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    const errorName =
      typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";

    if (errorName.toLowerCase().includes("abort")) {
      throw error;
    }

    throw new Error("Unable to load your order tracking right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your order tracking");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const normalized = normalizeBookProgressPayload(payload);

  return {
    ...normalized,
    sourceEndpoint: "orders_tracking",
    orderId: toStringValue(root?.orderId) ?? toStringValue(data?.orderId) ?? requestedOrderId,
    orderNumber: toStringValue(root?.orderNumber) ?? toStringValue(data?.orderNumber),
    trackingNumber: toStringValue(root?.trackingNumber) ?? toStringValue(data?.trackingNumber),
    shippingProvider:
      toStringValue(root?.shippingProvider) ?? toStringValue(data?.shippingProvider),
    currentOrderStatus:
      toStringValue(root?.currentOrderStatus) ?? toStringValue(data?.currentOrderStatus),
    currentBookStatus:
      toStringValue(root?.currentBookStatus) ?? toStringValue(data?.currentBookStatus),
    bookId: normalized.bookId,
  };
}

type UseOrderTrackingParams = {
  orderId?: string | null;
  enabled?: boolean;
};

export function useOrderTracking({ orderId, enabled = true }: UseOrderTrackingParams) {
  const resolvedOrderId = resolveOrderId(orderId);
  const fallbackData = createFallbackOrderTracking(resolvedOrderId);

  const query = useQuery({
    queryKey: resolvedOrderId
      ? orderTrackingQueryKeys.detail(resolvedOrderId)
      : orderTrackingQueryKeys.all,
    meta: {
      sentryName: "fetchOrderTracking",
      sentryEndpoint: "/api/v1/orders/:id/tracking",
    },
    queryFn: ({ signal }) => {
      if (!resolvedOrderId) {
        return Promise.resolve(fallbackData);
      }

      return fetchOrderTracking({
        orderId: resolvedOrderId,
        signal,
      });
    },
    ...dashboardStatusPollingQueryOptions,
    enabled: enabled && Boolean(resolvedOrderId),
  });

  const data = query.data ?? fallbackData;
  const isInitialLoading = query.isPending && !query.data;

  return {
    ...query,
    data,
    orderId: data.orderId || resolvedOrderId || "",
    orderNumber: data.orderNumber,
    trackingNumber: data.trackingNumber,
    shippingProvider: data.shippingProvider,
    currentOrderStatus: data.currentOrderStatus,
    currentBookStatus: data.currentBookStatus,
    bookId: data.bookId,
    currentStage: data.currentStage,
    rejectionReason: data.rejectionReason,
    timeline: data.timeline,
    isRejected: data.isRejected,
    title: data.title,
    coverImageUrl: data.coverImageUrl,
    sourceEndpoint: data.sourceEndpoint,
    isInitialLoading,
  };
}
