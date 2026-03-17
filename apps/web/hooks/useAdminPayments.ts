"use client";

import type {
  AdminPaymentSortField,
  AdminPaymentsListResponse,
  AdminPendingBankTransferItem,
  AdminPendingBankTransfersResponse,
  PaymentProvider,
  PaymentStatus,
  PendingBankTransferSlaState,
} from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import {
  ADMIN_PAYMENTS_LIMIT,
  DEFAULT_ADMIN_PAYMENT_SORT_BY,
  DEFAULT_ADMIN_PAYMENT_SORT_DIRECTION,
} from "./use-admin-payments-filters";

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

export const ADMIN_PENDING_BANK_TRANSFER_SLA_GREEN_MINUTES = 15;
export const ADMIN_PENDING_BANK_TRANSFER_SLA_RED_MINUTES = 30;
export const PENDING_BANK_TRANSFER_REFETCH_INTERVAL_MS = 60_000;

export type AdminPaymentsQueryInput = {
  cursor?: string;
  limit?: number;
  status?: PaymentStatus | "";
  provider?: PaymentProvider | "";
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  sortBy?: AdminPaymentSortField;
  sortDirection?: "asc" | "desc";
};

export type PendingBankTransferLiveSla = {
  ageMinutes: number;
  label: string;
  ariaLabel: string;
  state: PendingBankTransferSlaState;
  isOverdue: boolean;
};

export type PendingBankTransferWithLiveSla = AdminPendingBankTransferItem & {
  liveSla: PendingBankTransferLiveSla;
};

function createEmptyAdminPaymentsResponse(
  limit = ADMIN_PAYMENTS_LIMIT,
  sortBy: AdminPaymentSortField = DEFAULT_ADMIN_PAYMENT_SORT_BY,
  sortDirection: "asc" | "desc" = DEFAULT_ADMIN_PAYMENT_SORT_DIRECTION
): AdminPaymentsListResponse {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalItems: 0,
    limit,
    sortBy,
    sortDirection,
    sortableFields: [
      "orderReference",
      "customerName",
      "customerEmail",
      "amount",
      "provider",
      "status",
      "createdAt",
    ],
  };
}

function createEmptyPendingBankTransfersResponse(): AdminPendingBankTransfersResponse {
  return {
    items: [],
    totalItems: 0,
    refreshedAt: new Date().toISOString(),
  };
}

export const adminPaymentsQueryKeys = {
  all: ["admin", "payments"] as const,
  list: (input: Required<AdminPaymentsQueryInput>) =>
    [
      "admin",
      "payments",
      input.cursor,
      input.limit,
      input.status,
      input.provider,
      input.dateFrom,
      input.dateTo,
      input.q,
      input.sortBy,
      input.sortDirection,
    ] as const,
  pending: () => ["admin", "payments", "pending-bank-transfers"] as const,
};

function resolveQueryInput(input: AdminPaymentsQueryInput): Required<AdminPaymentsQueryInput> {
  return {
    cursor: input.cursor?.trim() || "",
    limit: input.limit ?? ADMIN_PAYMENTS_LIMIT,
    status: input.status ?? "",
    provider: input.provider ?? "",
    dateFrom: input.dateFrom?.trim() || "",
    dateTo: input.dateTo?.trim() || "",
    q: input.q?.trim() || "",
    sortBy: input.sortBy ?? DEFAULT_ADMIN_PAYMENT_SORT_BY,
    sortDirection: input.sortDirection ?? DEFAULT_ADMIN_PAYMENT_SORT_DIRECTION,
  };
}

export function resolvePendingBankTransferAgeMinutes(
  createdAt: string | null | undefined,
  nowMs = Date.now()
): number {
  if (!createdAt) return 0;

  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return 0;

  return Math.max(0, Math.floor((nowMs - createdAtMs) / 60_000));
}

export function resolvePendingBankTransferSlaState(
  ageMinutes: number
): PendingBankTransferSlaState {
  if (ageMinutes < ADMIN_PENDING_BANK_TRANSFER_SLA_GREEN_MINUTES) {
    return "green";
  }

  if (ageMinutes < ADMIN_PENDING_BANK_TRANSFER_SLA_RED_MINUTES) {
    return "yellow";
  }

  return "red";
}

export function formatPendingBankTransferAgeLabel(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatPendingBankTransferAgeAriaLabel(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} waiting`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  const hoursLabel = `${hours} hour${hours === 1 ? "" : "s"}`;
  const minutesLabel = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${hoursLabel} ${minutesLabel} waiting`;
}

export function derivePendingBankTransferLiveSla(
  item: Pick<AdminPendingBankTransferItem, "createdAt">,
  nowMs = Date.now()
): PendingBankTransferLiveSla {
  const ageMinutes = resolvePendingBankTransferAgeMinutes(item.createdAt, nowMs);
  const state = resolvePendingBankTransferSlaState(ageMinutes);

  return {
    ageMinutes,
    label: formatPendingBankTransferAgeLabel(ageMinutes),
    ariaLabel: formatPendingBankTransferAgeAriaLabel(ageMinutes),
    state,
    isOverdue: state === "red",
  };
}

function sortPendingBankTransfersOldestFirst(
  items: readonly AdminPendingBankTransferItem[]
): AdminPendingBankTransferItem[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

function useMinuteTicker(intervalMs = PENDING_BANK_TRANSFER_REFETCH_INTERVAL_MS): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs]);

  return nowMs;
}

export async function fetchAdminPayments(
  input: AdminPaymentsQueryInput & { signal?: AbortSignal } = {}
): Promise<AdminPaymentsListResponse> {
  const query = resolveQueryInput(input);
  const params = new URLSearchParams({
    limit: String(query.limit),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.status) params.set("status", query.status);
  if (query.provider) params.set("provider", query.provider);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.q) params.set("q", query.q);

  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/admin/payments?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load admin payments right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin payments");
  }

  return (await response.json()) as AdminPaymentsListResponse;
}

export async function fetchPendingBankTransfers({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<AdminPendingBankTransfersResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/payments/pending-bank-transfers`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load pending bank transfers right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load pending bank transfers");
  }

  return (await response.json()) as AdminPendingBankTransfersResponse;
}

export function useAdminPayments(input: AdminPaymentsQueryInput) {
  const queryInput = resolveQueryInput(input);

  const query = useQuery({
    queryKey: adminPaymentsQueryKeys.list(queryInput),
    meta: {
      sentryName: "fetchAdminPayments",
      sentryEndpoint: "/api/v1/admin/payments",
    },
    queryFn: ({ signal }) =>
      fetchAdminPayments({
        ...queryInput,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data =
    query.data ??
    createEmptyAdminPaymentsResponse(queryInput.limit, queryInput.sortBy, queryInput.sortDirection);

  return {
    ...query,
    data,
    items: data.items,
    isInitialLoading: query.isPending && !query.data,
    isPageTransitioning: query.isFetching && query.isPlaceholderData,
  };
}

export function usePendingBankTransfers() {
  const nowMs = useMinuteTicker();

  const query = useQuery({
    queryKey: adminPaymentsQueryKeys.pending(),
    meta: {
      sentryName: "fetchPendingBankTransfers",
      sentryEndpoint: "/api/v1/admin/payments/pending-bank-transfers",
    },
    queryFn: ({ signal }) => fetchPendingBankTransfers({ signal }),
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    refetchInterval: PENDING_BANK_TRANSFER_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const data = query.data ?? createEmptyPendingBankTransfersResponse();
  const items = useMemo<PendingBankTransferWithLiveSla[]>(
    () =>
      sortPendingBankTransfersOldestFirst(data.items).map((item) => ({
        ...item,
        liveSla: derivePendingBankTransferLiveSla(item, nowMs),
      })),
    [data.items, nowMs]
  );

  return {
    ...query,
    data,
    items,
    totalItems: data.totalItems,
    refreshedAt: data.refreshedAt,
    isInitialLoading: query.isPending && !query.data,
  };
}
