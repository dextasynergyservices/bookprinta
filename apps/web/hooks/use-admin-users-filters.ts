"use client";

import type { AdminUserSortField, UserRoleValue } from "@bookprinta/shared";
import { useSearchParams } from "next/navigation";
import { startTransition, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

export const ADMIN_USERS_LIMIT = 20;
export const DEFAULT_ADMIN_USER_SORT_BY: AdminUserSortField = "createdAt";
export const DEFAULT_ADMIN_USER_SORT_DIRECTION = "desc" as const;

const ADMIN_USER_SORT_FIELDS: AdminUserSortField[] = [
  "fullName",
  "email",
  "role",
  "isVerified",
  "createdAt",
] as const;

export const ADMIN_USER_ROLE_OPTIONS: UserRoleValue[] = [
  "USER",
  "ADMIN",
  "EDITOR",
  "MANAGER",
  "SUPER_ADMIN",
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

function normalizeTextParam(value: SearchParamValue): string {
  return value?.trim() ?? "";
}

function normalizeBooleanParam(value: SearchParamValue): boolean | "" {
  if (!value) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  return "";
}

function normalizeSortField(value: SearchParamValue): AdminUserSortField {
  const normalized = value?.trim() ?? "";
  return ADMIN_USER_SORT_FIELDS.includes(normalized as AdminUserSortField)
    ? (normalized as AdminUserSortField)
    : DEFAULT_ADMIN_USER_SORT_BY;
}

function normalizeSortDirection(value: SearchParamValue): "asc" | "desc" {
  return value === "asc" ? "asc" : DEFAULT_ADMIN_USER_SORT_DIRECTION;
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

export function humanizeAdminUserValue(value: string | null | undefined): string {
  if (!value) return "Unknown";

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function useAdminUsersFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(() => {
    const role = normalizeEnumParam(searchParams.get("role"), ADMIN_USER_ROLE_OPTIONS, "");
    const isVerified = normalizeBooleanParam(searchParams.get("isVerified"));
    const q = normalizeTextParam(searchParams.get("q"));
    const cursor = normalizeTextParam(searchParams.get("cursor"));
    const trail = decodeCursorTrail(searchParams.get("trail"));
    const sortBy = normalizeSortField(searchParams.get("sortBy"));
    const sortDirection = normalizeSortDirection(searchParams.get("sortDirection"));

    return {
      role,
      isVerified,
      q,
      cursor,
      trail,
      sortBy,
      sortDirection,
      currentPage: trail.length + 1,
      activeFilterCount: [Boolean(role), isVerified !== "", Boolean(q)].filter(Boolean).length,
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

  const setRole = useCallback(
    (role: UserRoleValue | "") => {
      replaceParams((params) => {
        if (role) {
          params.set("role", role);
        } else {
          params.delete("role");
        }

        resetCursorParams(params);
      });
    },
    [replaceParams]
  );

  const setVerification = useCallback(
    (isVerified: boolean | "") => {
      replaceParams((params) => {
        if (typeof isVerified === "boolean") {
          params.set("isVerified", String(isVerified));
        } else {
          params.delete("isVerified");
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

  const clearFilters = useCallback(() => {
    replaceParams((params) => {
      params.delete("role");
      params.delete("isVerified");
      params.delete("q");
      resetCursorParams(params);
    });
  }, [replaceParams]);

  const setSort = useCallback(
    (sortBy: AdminUserSortField, sortDirection: "asc" | "desc") => {
      replaceParams((params) => {
        if (sortBy === DEFAULT_ADMIN_USER_SORT_BY) {
          params.delete("sortBy");
        } else {
          params.set("sortBy", sortBy);
        }

        if (sortDirection === DEFAULT_ADMIN_USER_SORT_DIRECTION) {
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
    setRole,
    setVerification,
    setSearch,
    clearFilters,
    setSort,
    goToNextCursor,
    goToPreviousCursor,
  };
}
