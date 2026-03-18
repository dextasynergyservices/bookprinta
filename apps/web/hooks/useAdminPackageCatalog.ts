"use client";

import type {
  AdminAddon,
  AdminCreateAddonInput,
  AdminCreatePackageCategoryInput,
  AdminCreatePackageInput,
  AdminDeleteAddonResponse,
  AdminDeletePackageCategoryResponse,
  AdminDeletePackageResponse,
  AdminPackage,
  AdminPackageCategory,
  AdminUpdateAddonInput,
  AdminUpdatePackageCategoryInput,
  AdminUpdatePackageInput,
} from "@bookprinta/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PACKAGE_CATEGORIES_QUERY_KEY, PACKAGES_QUERY_KEY } from "@/lib/api/packages";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

export const adminPackageCatalogQueryKeys = {
  all: ["admin", "package-catalog"] as const,
  categories: ["admin", "package-catalog", "categories"] as const,
  packages: ["admin", "package-catalog", "packages"] as const,
  addons: ["admin", "package-catalog", "addons"] as const,
};

const PUBLIC_ADDONS_QUERY_KEY = ["addons"] as const;

const bySortOrderThenName = <T extends { sortOrder: number; name: string }>(left: T, right: T) => {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.name.localeCompare(right.name);
};

function upsertById<T extends { id: string }>(items: T[], value: T): T[] {
  const index = items.findIndex((item) => item.id === value.id);
  if (index === -1) {
    return [...items, value];
  }

  const next = items.slice();
  next[index] = value;
  return next;
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export type AdminPackageCatalogError = {
  title: string;
  description: string;
};

function normalizeCatalogError(error: unknown): AdminPackageCatalogError {
  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      title: "Action failed",
      description: error.message,
    };
  }

  return {
    title: "Action failed",
    description: "Unable to complete this action right now.",
  };
}

async function fetchAdminPackageCategories(): Promise<AdminPackageCategory[]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/package-categories", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to load package categories right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load package categories");
  }

  return (await response.json()) as AdminPackageCategory[];
}

async function createAdminPackageCategory(
  input: AdminCreatePackageCategoryInput
): Promise<AdminPackageCategory> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/package-categories", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create package category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create package category");
  }

  return (await response.json()) as AdminPackageCategory;
}

async function fetchAdminPackages(): Promise<AdminPackage[]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/packages", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to load packages right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load packages");
  }

  return (await response.json()) as AdminPackage[];
}

async function createAdminPackage(input: AdminCreatePackageInput): Promise<AdminPackage> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/packages", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create package right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create package");
  }

  return (await response.json()) as AdminPackage;
}

async function fetchAdminAddons(): Promise<AdminAddon[]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/addons", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to load addons right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load addons");
  }

  return (await response.json()) as AdminAddon[];
}

async function createAdminAddon(input: AdminCreateAddonInput): Promise<AdminAddon> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/addons", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create addon right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create addon");
  }

  return (await response.json()) as AdminAddon;
}

async function updateAdminAddon(params: {
  addonId: string;
  input: AdminUpdateAddonInput;
}): Promise<AdminAddon> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/addons/${encodeURIComponent(params.addonId)}`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.input),
    });
  } catch {
    throw new Error("Unable to update addon right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update addon");
  }

  return (await response.json()) as AdminAddon;
}

async function deleteAdminAddon(addonId: string): Promise<AdminAddon> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/addons/${encodeURIComponent(addonId)}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to delete addon right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete addon");
  }

  return (await response.json()) as AdminAddon;
}

async function deleteAdminAddonPermanently(addonId: string): Promise<AdminDeleteAddonResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/addons/${encodeURIComponent(addonId)}/permanent`,
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }
    );
  } catch {
    throw new Error("Unable to permanently delete addon right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to permanently delete addon");
  }

  return (await response.json()) as AdminDeleteAddonResponse;
}

async function updateAdminPackage(params: {
  packageId: string;
  input: AdminUpdatePackageInput;
}): Promise<AdminPackage> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/packages/${encodeURIComponent(params.packageId)}`,
      {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.input),
      }
    );
  } catch {
    throw new Error("Unable to update package right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update package");
  }

  return (await response.json()) as AdminPackage;
}

async function deleteAdminPackagePermanently(
  packageId: string
): Promise<AdminDeletePackageResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/packages/${encodeURIComponent(packageId)}/permanent`,
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }
    );
  } catch {
    throw new Error("Unable to permanently delete package right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to permanently delete package");
  }

  return (await response.json()) as AdminDeletePackageResponse;
}

async function updateAdminPackageCategory(params: {
  categoryId: string;
  input: AdminUpdatePackageCategoryInput;
}): Promise<AdminPackageCategory> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/package-categories/${encodeURIComponent(params.categoryId)}`,
      {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.input),
      }
    );
  } catch {
    throw new Error("Unable to update package category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update package category");
  }

  return (await response.json()) as AdminPackageCategory;
}

async function deleteAdminPackageCategory(
  categoryId: string
): Promise<AdminDeletePackageCategoryResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/package-categories/${encodeURIComponent(categoryId)}`,
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }
    );
  } catch {
    throw new Error("Unable to delete package category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete package category");
  }

  return (await response.json()) as AdminDeletePackageCategoryResponse;
}

async function invalidateCatalogQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminPackageCatalogQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: adminPackageCatalogQueryKeys.categories }),
    queryClient.invalidateQueries({ queryKey: adminPackageCatalogQueryKeys.packages }),
    queryClient.invalidateQueries({ queryKey: adminPackageCatalogQueryKeys.addons }),
    queryClient.invalidateQueries({ queryKey: PACKAGE_CATEGORIES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: PACKAGES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: PUBLIC_ADDONS_QUERY_KEY }),
  ]);
}

async function cancelCatalogQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: adminPackageCatalogQueryKeys.categories }),
    queryClient.cancelQueries({ queryKey: adminPackageCatalogQueryKeys.packages }),
    queryClient.cancelQueries({ queryKey: adminPackageCatalogQueryKeys.addons }),
    queryClient.cancelQueries({ queryKey: PACKAGE_CATEGORIES_QUERY_KEY }),
    queryClient.cancelQueries({ queryKey: PACKAGES_QUERY_KEY }),
    queryClient.cancelQueries({ queryKey: PUBLIC_ADDONS_QUERY_KEY }),
  ]);
}

function syncCategoryInAdminCache(
  queryClient: ReturnType<typeof useQueryClient>,
  category: AdminPackageCategory
) {
  queryClient.setQueryData<AdminPackageCategory[]>(
    adminPackageCatalogQueryKeys.categories,
    (current = []) => upsertById(current, category).sort(bySortOrderThenName)
  );
}

function removeCategoryFromAdminCache(
  queryClient: ReturnType<typeof useQueryClient>,
  categoryId: string
) {
  queryClient.setQueryData<AdminPackageCategory[]>(
    adminPackageCatalogQueryKeys.categories,
    (current = []) => removeById(current, categoryId).sort(bySortOrderThenName)
  );
}

function syncPackageInAdminCache(
  queryClient: ReturnType<typeof useQueryClient>,
  pkg: AdminPackage
) {
  queryClient.setQueryData<AdminPackage[]>(adminPackageCatalogQueryKeys.packages, (current = []) =>
    upsertById(current, pkg).sort(bySortOrderThenName)
  );
}

function syncAddonInAdminCache(queryClient: ReturnType<typeof useQueryClient>, addon: AdminAddon) {
  queryClient.setQueryData<AdminAddon[]>(adminPackageCatalogQueryKeys.addons, (current = []) =>
    upsertById(current, addon).sort(bySortOrderThenName)
  );
}

function removePackageFromAdminCache(
  queryClient: ReturnType<typeof useQueryClient>,
  packageId: string
) {
  queryClient.setQueryData<AdminPackage[]>(adminPackageCatalogQueryKeys.packages, (current = []) =>
    removeById(current, packageId).sort(bySortOrderThenName)
  );
}

function removeAddonFromAdminCache(
  queryClient: ReturnType<typeof useQueryClient>,
  addonId: string
) {
  queryClient.setQueryData<AdminAddon[]>(adminPackageCatalogQueryKeys.addons, (current = []) =>
    removeById(current, addonId).sort(bySortOrderThenName)
  );
}

export function useAdminPackageCategories() {
  const query = useQuery({
    queryKey: adminPackageCatalogQueryKeys.categories,
    meta: {
      sentryName: "fetchAdminPackageCategories",
      sentryEndpoint: "/api/v1/admin/package-categories",
    },
    queryFn: fetchAdminPackageCategories,
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
}

export function useAdminPackages() {
  const query = useQuery({
    queryKey: adminPackageCatalogQueryKeys.packages,
    meta: {
      sentryName: "fetchAdminPackages",
      sentryEndpoint: "/api/v1/admin/packages",
    },
    queryFn: fetchAdminPackages,
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
}

export function useAdminAddons() {
  const query = useQuery({
    queryKey: adminPackageCatalogQueryKeys.addons,
    meta: {
      sentryName: "fetchAdminAddons",
      sentryEndpoint: "/api/v1/admin/addons",
    },
    queryFn: fetchAdminAddons,
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
}

export function useCreatePackageCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreatePackageCategoryInput) => createAdminPackageCategory(input),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async (createdCategory) => {
      syncCategoryInAdminCache(queryClient, createdCategory);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useUpdatePackageCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { categoryId: string; input: AdminUpdatePackageCategoryInput }) =>
      updateAdminPackageCategory(params),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async (updatedCategory) => {
      syncCategoryInAdminCache(queryClient, updatedCategory);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useDeletePackageCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => deleteAdminPackageCategory(categoryId),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async ({ id }) => {
      removeCategoryFromAdminCache(queryClient, id);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useCreatePackageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreatePackageInput) => createAdminPackage(input),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async (createdPackage) => {
      syncPackageInAdminCache(queryClient, createdPackage);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useUpdatePackageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { packageId: string; input: AdminUpdatePackageInput }) =>
      updateAdminPackage(params),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async (updatedPackage) => {
      syncPackageInAdminCache(queryClient, updatedPackage);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useDeletePackageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packageId: string) => deleteAdminPackagePermanently(packageId),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async ({ id }) => {
      removePackageFromAdminCache(queryClient, id);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useCreateAddonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCreateAddonInput) => createAdminAddon(input),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async (createdAddon) => {
      syncAddonInAdminCache(queryClient, createdAddon);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useUpdateAddonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { addonId: string; input: AdminUpdateAddonInput }) =>
      updateAdminAddon(params),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async (updatedAddon) => {
      syncAddonInAdminCache(queryClient, updatedAddon);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useDeleteAddonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (addonId: string) => deleteAdminAddon(addonId),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async (deletedAddon) => {
      syncAddonInAdminCache(queryClient, deletedAddon);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export function useDeleteAddonPermanentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (addonId: string) => deleteAdminAddonPermanently(addonId),
    onMutate: async () => {
      await cancelCatalogQueries(queryClient);
    },
    onSuccess: async ({ id }) => {
      removeAddonFromAdminCache(queryClient, id);
      await invalidateCatalogQueries(queryClient);
    },
  });
}

export { normalizeCatalogError };
