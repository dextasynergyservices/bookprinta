"use client";

import type { AdminOrderDisplayStatus, AdminOrderSortField } from "@bookprinta/shared";
import { useSearchParams } from "next/navigation";
import { startTransition, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

export const ADMIN_ORDERS_LIMIT = 20;
export const DEFAULT_ADMIN_ORDER_SORT_BY: AdminOrderSortField = "createdAt";
export const DEFAULT_ADMIN_ORDER_SORT_DIRECTION = "desc" as const;
const ADMIN_ORDER_SORT_FIELDS: AdminOrderSortField[] = [
  "orderNumber",
  "customerName",
  "customerEmail",
  "packageName",
  "displayStatus",
  "createdAt",
  "totalAmount",
] as const;

export const ADMIN_ORDER_STATUS_OPTIONS: AdminOrderDisplayStatus[] = [
  "PENDING_PAYMENT",
  "PENDING_PAYMENT_APPROVAL",
  "PAID",
  "PROCESSING",
  "AWAITING_UPLOAD",
  "UPLOADED",
  "PAYMENT_RECEIVED",
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "ACTION_REQUIRED",
  "PREVIEW_READY",
  "PENDING_EXTRA_PAYMENT",
  "REVIEW",
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
  "REJECTED",
] as const;

type SearchParamValue = string | null;
type CursorTrailEntry = string | null;

function normalizeEnumParam<TValue extends string>(
  value: SearchParamValue,
  allowedValues: readonly TValue[],
  fallback: TValue | ""
): TValue | "" {
  if (!value) return fallback;
  const normalized = value.trim();
  return allowedValues.includes(normalized as TValue) ? (normalized as TValue) : fallback;
}

function normalizeDateParam(value: SearchParamValue): string {
  if (!value) return "";
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeTextParam(value: SearchParamValue): string {
  return value?.trim() ?? "";
}

function normalizeSortField(value: SearchParamValue): AdminOrderSortField {
  const normalized = value?.trim() ?? "";
  return ADMIN_ORDER_SORT_FIELDS.includes(normalized as AdminOrderSortField)
    ? (normalized as AdminOrderSortField)
    : DEFAULT_ADMIN_ORDER_SORT_BY;
}

function normalizeSortDirection(value: SearchParamValue): "asc" | "desc" {
  return value === "asc" ? "asc" : DEFAULT_ADMIN_ORDER_SORT_DIRECTION;
}

function decodeCursorTrail(value: SearchParamValue): CursorTrailEntry[] {
  if (!value) return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry === "root" ? null : entry));
}

function encodeCursorTrail(trail: CursorTrailEntry[]): string {
  return trail.map((entry) => entry ?? "root").join(",");
}

function resetCursorParams(params: URLSearchParams) {
  params.delete("cursor");
  params.delete("trail");
}

export function humanizeAdminOrderStatus(value: string | null | undefined): string {
  if (!value) return "Unknown";

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function useAdminOrdersFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(() => {
    const status = normalizeEnumParam(searchParams.get("status"), ADMIN_ORDER_STATUS_OPTIONS, "");
    const packageId = normalizeTextParam(searchParams.get("packageId"));
    const dateFrom = normalizeDateParam(searchParams.get("dateFrom"));
    const dateTo = normalizeDateParam(searchParams.get("dateTo"));
    const q = normalizeTextParam(searchParams.get("q"));
    const cursor = normalizeTextParam(searchParams.get("cursor"));
    const trail = decodeCursorTrail(searchParams.get("trail"));
    const sortBy = normalizeSortField(searchParams.get("sortBy"));
    const sortDirection = normalizeSortDirection(searchParams.get("sortDirection"));

    return {
      status,
      packageId,
      dateFrom,
      dateTo,
      q,
      cursor,
      trail,
      sortBy,
      sortDirection,
      currentPage: trail.length + 1,
      activeFilterCount: [
        Boolean(status),
        Boolean(packageId),
        Boolean(q),
        Boolean(dateFrom || dateTo),
      ].filter(Boolean).length,
    };
  }, [searchParams]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);

      const query = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${query ? `?${query}` : ""}`, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams]
  );

  const setStatus = useCallback(
    (status: AdminOrderDisplayStatus | "") => {
      replaceParams((params) => {
        if (status) {
          params.set("status", status);
        } else {
          params.delete("status");
        }

        resetCursorParams(params);
      });
    },
    [replaceParams]
  );

  const setPackageId = useCallback(
    (packageId: string) => {
      replaceParams((params) => {
        if (packageId.trim()) {
          params.set("packageId", packageId.trim());
        } else {
          params.delete("packageId");
        }

        resetCursorParams(params);
      });
    },
    [replaceParams]
  );

  const setSearch = useCallback(
    (value: string) => {
      replaceParams((params) => {
        const normalized = value.trim();
        if (normalized.length > 0) {
          params.set("q", normalized);
        } else {
          params.delete("q");
        }

        resetCursorParams(params);
      });
    },
    [replaceParams]
  );

  const setDateRange = useCallback(
    (range: { dateFrom?: string; dateTo?: string }) => {
      replaceParams((params) => {
        const normalizedDateFrom = normalizeDateParam(range.dateFrom ?? null);
        const normalizedDateTo = normalizeDateParam(range.dateTo ?? null);

        if (normalizedDateFrom) {
          params.set("dateFrom", normalizedDateFrom);
        } else {
          params.delete("dateFrom");
        }

        if (normalizedDateTo) {
          params.set("dateTo", normalizedDateTo);
        } else {
          params.delete("dateTo");
        }

        resetCursorParams(params);
      });
    },
    [replaceParams]
  );

  const clearFilters = useCallback(() => {
    replaceParams((params) => {
      params.delete("status");
      params.delete("packageId");
      params.delete("dateFrom");
      params.delete("dateTo");
      params.delete("q");
      resetCursorParams(params);
    });
  }, [replaceParams]);

  const setSort = useCallback(
    (sortBy: AdminOrderSortField, sortDirection: "asc" | "desc") => {
      replaceParams((params) => {
        if (sortBy === DEFAULT_ADMIN_ORDER_SORT_BY) {
          params.delete("sortBy");
        } else {
          params.set("sortBy", sortBy);
        }

        if (sortDirection === DEFAULT_ADMIN_ORDER_SORT_DIRECTION) {
          params.delete("sortDirection");
        } else {
          params.set("sortDirection", sortDirection);
        }

        resetCursorParams(params);
      });
    },
    [replaceParams]
  );

  const goToNextCursor = useCallback(
    (nextCursor: string | null) => {
      if (!nextCursor) return;

      replaceParams((params) => {
        const nextTrail = [...filters.trail, filters.cursor || null];
        params.set("cursor", nextCursor);
        params.set("trail", encodeCursorTrail(nextTrail));
      });
    },
    [filters.cursor, filters.trail, replaceParams]
  );

  const goToPreviousCursor = useCallback(() => {
    if (filters.trail.length === 0) return;

    replaceParams((params) => {
      const nextTrail = filters.trail.slice(0, -1);
      const previousCursor = filters.trail[filters.trail.length - 1] ?? null;

      if (previousCursor) {
        params.set("cursor", previousCursor);
      } else {
        params.delete("cursor");
      }

      if (nextTrail.length > 0) {
        params.set("trail", encodeCursorTrail(nextTrail));
      } else {
        params.delete("trail");
      }
    });
  }, [filters.trail, replaceParams]);

  return {
    ...filters,
    hasActiveFilters: filters.activeFilterCount > 0,
    setStatus,
    setPackageId,
    setSearch,
    setDateRange,
    clearFilters,
    setSort,
    goToNextCursor,
    goToPreviousCursor,
  };
}
