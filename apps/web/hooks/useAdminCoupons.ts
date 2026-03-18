"use client";

import type { Coupon, CreateCouponInput, UpdateCouponInput } from "@bookprinta/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

export const adminCouponsQueryKeys = {
  all: ["admin", "coupons"] as const,
  list: () => ["admin", "coupons", "list"] as const,
};

export type UpdateAdminCouponVariables = {
  couponId: string;
  input: UpdateCouponInput;
};

export type ToggleAdminCouponActiveVariables = {
  couponId: string;
  isActive: boolean;
};

export type DeleteAdminCouponResponse = {
  id: string;
  deleted: true;
};

export type AdminCouponAnalyticsBreakdownItem = {
  packageId: string;
  packageName: string;
  categoryId: string;
  categoryName: string;
  orderCount: number;
  discountAmount: number;
};

export type AdminCouponAnalyticsItem = {
  couponId: string;
  couponCode: string;
  orderCount: number;
  usageCount: number;
  totalDiscountAmount: number;
  totalRevenueAmount: number;
  packageBreakdown: AdminCouponAnalyticsBreakdownItem[];
};

async function fetchAdminCoupons(input: { signal?: AbortSignal } = {}): Promise<Coupon[]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/coupons", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load admin coupons right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load admin coupons");
  }

  return (await response.json()) as Coupon[];
}

async function fetchAdminCouponAnalytics(
  input: { signal?: AbortSignal } = {}
): Promise<AdminCouponAnalyticsItem[]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/coupons/analytics", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load coupon analytics right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load coupon analytics");
  }

  return (await response.json()) as AdminCouponAnalyticsItem[];
}

async function createAdminCoupon(input: CreateCouponInput): Promise<Coupon> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/coupons", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create coupon right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create coupon");
  }

  return (await response.json()) as Coupon;
}

async function updateAdminCoupon({ couponId, input }: UpdateAdminCouponVariables): Promise<Coupon> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/coupons/${encodeURIComponent(couponId)}`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to update coupon right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update coupon");
  }

  return (await response.json()) as Coupon;
}

async function toggleAdminCouponActive({
  couponId,
  isActive,
}: ToggleAdminCouponActiveVariables): Promise<Coupon> {
  return updateAdminCoupon({
    couponId,
    input: {
      isActive,
    },
  });
}

async function deleteAdminCoupon(couponId: string): Promise<DeleteAdminCouponResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/coupons/${encodeURIComponent(couponId)}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to delete coupon right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete coupon");
  }

  return (await response.json()) as DeleteAdminCouponResponse;
}

export function useAdminCoupons() {
  const query = useQuery({
    queryKey: adminCouponsQueryKeys.list(),
    meta: {
      sentryName: "fetchAdminCoupons",
      sentryEndpoint: "/api/v1/admin/coupons",
    },
    queryFn: ({ signal }) => fetchAdminCoupons({ signal }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = query.data ?? [];

  return {
    ...query,
    data,
    items: data,
    isInitialLoading: query.isPending && !query.data,
  };
}

export function useAdminCouponAnalytics(enabled = true) {
  const query = useQuery({
    queryKey: [...adminCouponsQueryKeys.list(), "analytics"],
    enabled,
    meta: {
      sentryName: "fetchAdminCouponAnalytics",
      sentryEndpoint: "/api/v1/admin/coupons/analytics",
    },
    queryFn: ({ signal }) => fetchAdminCouponAnalytics({ signal }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = query.data ?? [];

  return {
    ...query,
    data,
    items: data,
    isInitialLoading: query.isPending && !query.data,
  };
}

export function useCreateAdminCouponMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCouponInput) => createAdminCoupon(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminCouponsQueryKeys.all,
      });
    },
  });
}

export function useUpdateAdminCouponMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: UpdateAdminCouponVariables) => updateAdminCoupon(variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminCouponsQueryKeys.all,
      });
    },
  });
}

export function useToggleAdminCouponActiveMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: ToggleAdminCouponActiveVariables) => toggleAdminCouponActive(variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminCouponsQueryKeys.all,
      });
    },
  });
}

export function useDeleteAdminCouponMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (couponId: string) => deleteAdminCoupon(couponId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminCouponsQueryKeys.all,
      });
    },
  });
}
