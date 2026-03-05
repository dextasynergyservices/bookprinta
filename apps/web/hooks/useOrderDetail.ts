"use client";

import { useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { ordersQueryKeys } from "./useOrders";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function toIsoDatetime(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function resolveOrderId(orderId: string | null | undefined): string | null {
  if (typeof orderId !== "string") return null;
  const normalized = orderId.trim();
  return normalized.length > 0 ? normalized : null;
}

type OrderDetailSummary = {
  orderId: string;
  orderNumber: string | null;
  packageName: string | null;
  packageAmount: number | null;
  totalAmount: number | null;
  currency: string | null;
  latestPaymentStatus: string | null;
  latestPaymentProvider: string | null;
  latestPaymentReference: string | null;
  latestPaymentAmount: number | null;
  latestPaymentCurrency: string | null;
  latestPaymentCreatedAt: string | null;
  trackingNumber: string | null;
  shippingProvider: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  addons: {
    id: string;
    name: string;
    price: number | null;
    wordCount: number | null;
  }[];
};

function createFallbackOrderDetail(orderId: string | null): OrderDetailSummary {
  return {
    orderId: orderId ?? "",
    orderNumber: null,
    packageName: null,
    packageAmount: null,
    totalAmount: null,
    currency: null,
    latestPaymentStatus: null,
    latestPaymentProvider: null,
    latestPaymentReference: null,
    latestPaymentAmount: null,
    latestPaymentCurrency: null,
    latestPaymentCreatedAt: null,
    trackingNumber: null,
    shippingProvider: null,
    createdAt: null,
    updatedAt: null,
    addons: [],
  };
}

function normalizeOrderAddon(value: unknown): OrderDetailSummary["addons"][number] | null {
  const record = toRecord(value);
  if (!record) return null;

  const addonId = toStringValue(record.id) ?? toStringValue(record.addonId);
  const addonName = toStringValue(record.name) ?? toStringValue(toRecord(record.addon)?.name);
  if (!addonId || !addonName) return null;

  return {
    id: addonId,
    name: addonName,
    price: toNumberValue(record.price) ?? toNumberValue(record.priceSnap),
    wordCount: toNumberValue(record.wordCount),
  };
}

function normalizeOrderDetailPayload(
  payload: unknown,
  requestedOrderId: string
): OrderDetailSummary {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const source = data ?? root;
  const packageRecord = toRecord(source?.package);
  const payments = toArray(source?.payments) ?? [];
  const latestPayment = toRecord(payments[0]);
  const addons = (toArray(source?.addons) ?? [])
    .map((item) => normalizeOrderAddon(item))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    orderId: toStringValue(source?.id) ?? toStringValue(source?.orderId) ?? requestedOrderId,
    orderNumber: toStringValue(source?.orderNumber),
    packageName: toStringValue(source?.packageName) ?? toStringValue(packageRecord?.name),
    packageAmount: toNumberValue(source?.packageAmount) ?? toNumberValue(source?.initialAmount),
    totalAmount: toNumberValue(source?.totalAmount),
    currency: toStringValue(source?.currency),
    latestPaymentStatus: toStringValue(latestPayment?.status),
    latestPaymentProvider: toStringValue(latestPayment?.provider),
    latestPaymentReference: toStringValue(latestPayment?.providerRef),
    latestPaymentAmount: toNumberValue(latestPayment?.amount),
    latestPaymentCurrency: toStringValue(latestPayment?.currency),
    latestPaymentCreatedAt: toIsoDatetime(latestPayment?.createdAt),
    trackingNumber: toStringValue(source?.trackingNumber),
    shippingProvider: toStringValue(source?.shippingProvider),
    createdAt: toIsoDatetime(source?.createdAt),
    updatedAt: toIsoDatetime(source?.updatedAt),
    addons,
  };
}

type FetchOrderDetailParams = {
  orderId: string;
  signal?: AbortSignal;
};

export async function fetchOrderDetail({
  orderId: requestedOrderId,
  signal,
}: FetchOrderDetailParams): Promise<OrderDetailSummary> {
  let response: Response;
  try {
    response = await fetch(`${API_V1_BASE_URL}/orders/${requestedOrderId}`, {
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

    throw new Error("Unable to load order details right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load order details");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeOrderDetailPayload(payload, requestedOrderId);
}

type UseOrderDetailParams = {
  orderId?: string | null;
  enabled?: boolean;
};

export function useOrderDetail({ orderId, enabled = true }: UseOrderDetailParams) {
  const resolvedOrderId = resolveOrderId(orderId);
  const fallbackData = createFallbackOrderDetail(resolvedOrderId);

  const query = useQuery({
    queryKey: resolvedOrderId ? ordersQueryKeys.detail(resolvedOrderId) : ordersQueryKeys.all,
    meta: {
      sentryName: "fetchOrderDetail",
      sentryEndpoint: "/api/v1/orders/:id",
    },
    queryFn: ({ signal }) => {
      if (!resolvedOrderId) {
        return Promise.resolve(fallbackData);
      }

      return fetchOrderDetail({
        orderId: resolvedOrderId,
        signal,
      });
    },
    staleTime: 60_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: enabled && Boolean(resolvedOrderId),
  });

  const data = query.data ?? fallbackData;
  const isInitialLoading = query.isPending && !query.data;

  return {
    ...query,
    data,
    orderId: data.orderId || resolvedOrderId,
    orderNumber: data.orderNumber,
    packageName: data.packageName,
    packageAmount: data.packageAmount,
    totalAmount: data.totalAmount,
    currency: data.currency,
    latestPaymentStatus: data.latestPaymentStatus,
    latestPaymentProvider: data.latestPaymentProvider,
    latestPaymentReference: data.latestPaymentReference,
    latestPaymentAmount: data.latestPaymentAmount,
    latestPaymentCurrency: data.latestPaymentCurrency,
    latestPaymentCreatedAt: data.latestPaymentCreatedAt,
    trackingNumber: data.trackingNumber,
    shippingProvider: data.shippingProvider,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    addons: data.addons,
    isInitialLoading,
  };
}
