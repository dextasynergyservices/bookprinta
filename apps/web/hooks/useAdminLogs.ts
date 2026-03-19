"use client";

import type {
  AdminAuditLogsQuery,
  AdminErrorLogActionBodyInput,
  AdminErrorLogsQuery,
} from "@bookprinta/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminAuditLogs,
  fetchAdminErrorLogs,
  normalizeAdminLogsError,
  updateAdminErrorLogAction,
} from "@/lib/api/admin-logs";

export const adminLogsQueryKeys = {
  all: ["admin", "logs"] as const,
  audit: ["admin", "logs", "audit"] as const,
  error: ["admin", "logs", "error"] as const,
  auditList: (query: ResolvedAdminAuditLogsQuery) =>
    [
      "admin",
      "logs",
      "audit",
      query.cursor,
      query.limit,
      query.action,
      query.userId,
      query.entityType,
      query.entityId,
      query.dateFrom,
      query.dateTo,
      query.q,
    ] as const,
  errorList: (query: ResolvedAdminErrorLogsQuery) =>
    [
      "admin",
      "logs",
      "error",
      query.cursor,
      query.limit,
      query.severity,
      query.status,
      query.service,
      query.ownerUserId,
      query.dateFrom,
      query.dateTo,
      query.q,
    ] as const,
};

type ResolvedAdminAuditLogsQuery = {
  cursor: string;
  limit: number;
  action: string;
  userId: string;
  entityType: string;
  entityId: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

type ResolvedAdminErrorLogsQuery = {
  cursor: string;
  limit: number;
  severity: "all" | "error" | "warn" | "info";
  status: "all" | "open" | "acknowledged" | "resolved";
  service: string;
  ownerUserId: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

function resolveAdminAuditLogsQuery(query: AdminAuditLogsQuery): ResolvedAdminAuditLogsQuery {
  return {
    cursor: query.cursor?.trim() || "",
    limit: query.limit ?? 25,
    action: query.action?.trim() || "",
    userId: query.userId?.trim() || "",
    entityType: query.entityType?.trim() || "",
    entityId: query.entityId?.trim() || "",
    dateFrom: query.dateFrom?.trim() || "",
    dateTo: query.dateTo?.trim() || "",
    q: query.q?.trim() || "",
  };
}

function resolveAdminErrorLogsQuery(query: AdminErrorLogsQuery): ResolvedAdminErrorLogsQuery {
  return {
    cursor: query.cursor?.trim() || "",
    limit: query.limit ?? 25,
    severity: query.severity ?? "all",
    status: query.status ?? "all",
    service: query.service?.trim() || "",
    ownerUserId: query.ownerUserId?.trim() || "",
    dateFrom: query.dateFrom?.trim() || "",
    dateTo: query.dateTo?.trim() || "",
    q: query.q?.trim() || "",
  };
}

function toAuditApiQuery(normalized: ResolvedAdminAuditLogsQuery): AdminAuditLogsQuery {
  return {
    ...(normalized.cursor ? { cursor: normalized.cursor } : {}),
    limit: normalized.limit,
    ...(normalized.action ? { action: normalized.action } : {}),
    ...(normalized.userId ? { userId: normalized.userId } : {}),
    ...(normalized.entityType ? { entityType: normalized.entityType } : {}),
    ...(normalized.entityId ? { entityId: normalized.entityId } : {}),
    ...(normalized.dateFrom ? { dateFrom: normalized.dateFrom } : {}),
    ...(normalized.dateTo ? { dateTo: normalized.dateTo } : {}),
    ...(normalized.q ? { q: normalized.q } : {}),
  };
}

function toErrorApiQuery(normalized: ResolvedAdminErrorLogsQuery): AdminErrorLogsQuery {
  return {
    ...(normalized.cursor ? { cursor: normalized.cursor } : {}),
    limit: normalized.limit,
    ...(normalized.severity !== "all" ? { severity: normalized.severity } : {}),
    ...(normalized.status !== "all" ? { status: normalized.status } : {}),
    ...(normalized.service ? { service: normalized.service } : {}),
    ...(normalized.ownerUserId ? { ownerUserId: normalized.ownerUserId } : {}),
    ...(normalized.dateFrom ? { dateFrom: normalized.dateFrom } : {}),
    ...(normalized.dateTo ? { dateTo: normalized.dateTo } : {}),
    ...(normalized.q ? { q: normalized.q } : {}),
  };
}

async function invalidateAdminLogsQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminLogsQueryKeys.audit }),
    queryClient.invalidateQueries({ queryKey: adminLogsQueryKeys.error }),
  ]);
}

export function useAdminAuditLogs(query: AdminAuditLogsQuery) {
  const normalizedQuery = resolveAdminAuditLogsQuery(query);
  const requestQuery = toAuditApiQuery(normalizedQuery);

  const auditLogsQuery = useQuery({
    queryKey: adminLogsQueryKeys.auditList(normalizedQuery),
    meta: {
      sentryName: "fetchAdminAuditLogs",
      sentryEndpoint: "/api/v1/admin/system/audit-logs",
    },
    queryFn: ({ signal }) => fetchAdminAuditLogs(requestQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = auditLogsQuery.data ?? {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalItems: 0,
    limit: requestQuery.limit ?? 25,
  };

  return {
    ...auditLogsQuery,
    data,
    items: data.items,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
    totalItems: data.totalItems,
    limit: data.limit,
    isInitialLoading: auditLogsQuery.isPending && !auditLogsQuery.data,
    isPageTransitioning: auditLogsQuery.isFetching && auditLogsQuery.isPlaceholderData,
  };
}

export function useAdminErrorLogs(query: AdminErrorLogsQuery) {
  const normalizedQuery = resolveAdminErrorLogsQuery(query);
  const requestQuery = toErrorApiQuery(normalizedQuery);

  const errorLogsQuery = useQuery({
    queryKey: adminLogsQueryKeys.errorList(normalizedQuery),
    meta: {
      sentryName: "fetchAdminErrorLogs",
      sentryEndpoint: "/api/v1/admin/system/error-logs",
    },
    queryFn: ({ signal }) => fetchAdminErrorLogs(requestQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = errorLogsQuery.data ?? {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalItems: 0,
    limit: requestQuery.limit ?? 25,
  };

  return {
    ...errorLogsQuery,
    data,
    items: data.items,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
    totalItems: data.totalItems,
    limit: data.limit,
    isInitialLoading: errorLogsQuery.isPending && !errorLogsQuery.data,
    isPageTransitioning: errorLogsQuery.isFetching && errorLogsQuery.isPlaceholderData,
  };
}

export function useUpdateAdminErrorLogActionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; body: AdminErrorLogActionBodyInput }) =>
      updateAdminErrorLogAction(input),
    onSuccess: async () => {
      await invalidateAdminLogsQueries(queryClient);
    },
  });
}

export function useAcknowledgeAdminErrorLogMutation() {
  const actionMutation = useUpdateAdminErrorLogActionMutation();

  return useMutation({
    mutationFn: (id: string) =>
      actionMutation.mutateAsync({
        id,
        body: { action: "acknowledge" },
      }),
  });
}

export function useAssignAdminErrorLogOwnerMutation() {
  const actionMutation = useUpdateAdminErrorLogActionMutation();

  return useMutation({
    mutationFn: (input: { id: string; ownerUserId: string }) =>
      actionMutation.mutateAsync({
        id: input.id,
        body: {
          action: "assign_owner",
          ownerUserId: input.ownerUserId,
        },
      }),
  });
}

export function useResolveAdminErrorLogMutation() {
  const actionMutation = useUpdateAdminErrorLogActionMutation();

  return useMutation({
    mutationFn: (id: string) =>
      actionMutation.mutateAsync({
        id,
        body: { action: "mark_resolved" },
      }),
  });
}

export function useAttachAdminErrorLogNoteMutation() {
  const actionMutation = useUpdateAdminErrorLogActionMutation();

  return useMutation({
    mutationFn: (input: { id: string; note: string }) =>
      actionMutation.mutateAsync({
        id: input.id,
        body: {
          action: "attach_note",
          note: input.note,
        },
      }),
  });
}

export { normalizeAdminLogsError };
