"use client";

import type {
  Address,
  AddressesListResponse,
  CreateAddressBodyInput,
  CreateAddressResponse,
  DeleteAddressResponse,
  UpdateAddressBodyInput,
  UpdateAddressResponse,
} from "@bookprinta/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  normalizeAddressesListPayload,
  normalizeCreateAddressPayload,
  normalizeDeleteAddressPayload,
  normalizeUpdateAddressPayload,
} from "@/lib/api/addresses-contract";
import { throwApiError } from "@/lib/api-error";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export const DASHBOARD_ADDRESSES_QUERY_KEY = ["dashboard", "addresses"] as const;

type UpdateAddressRequestInput = {
  addressId: string;
  input: UpdateAddressBodyInput;
};

type DeleteAddressRequestInput = {
  addressId: string;
};

function createEmptyAddressesResponse(): AddressesListResponse {
  return {
    items: [],
  };
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

function compareAddresses(left: Address, right: Address): number {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  const updatedAtDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  return right.id.localeCompare(left.id);
}

function sortAddresses(items: Address[]): Address[] {
  return [...items].sort(compareAddresses);
}

function upsertAddressInCache(
  current: AddressesListResponse | undefined,
  nextAddress: CreateAddressResponse | UpdateAddressResponse
): AddressesListResponse {
  const existingItems = current?.items ?? [];
  const items = existingItems.filter((item) => item.id !== nextAddress.id);
  items.push(nextAddress);

  return {
    items: sortAddresses(items),
  };
}

function removeAddressFromCache(
  current: AddressesListResponse | undefined,
  addressId: string
): AddressesListResponse | undefined {
  if (!current) {
    return current;
  }

  return {
    items: current.items.filter((item) => item.id !== addressId),
  };
}

export async function fetchAddresses({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<AddressesListResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_V1_BASE_URL}/addresses`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load your addresses right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your addresses");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeAddressesListPayload(payload);
}

export async function createAddressRequest(
  input: CreateAddressBodyInput
): Promise<CreateAddressResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/addresses`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to save your address");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeCreateAddressPayload(payload);
}

export async function updateAddressRequest({
  addressId,
  input,
}: UpdateAddressRequestInput): Promise<UpdateAddressResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/addresses/${encodeURIComponent(addressId)}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to update your address");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeUpdateAddressPayload(payload);
}

export async function deleteAddressRequest({
  addressId,
}: DeleteAddressRequestInput): Promise<DeleteAddressResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/addresses/${encodeURIComponent(addressId)}`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to delete your address");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeDeleteAddressPayload(payload);
}

export function useAddresses() {
  const query = useQuery({
    queryKey: DASHBOARD_ADDRESSES_QUERY_KEY,
    meta: {
      sentryName: "fetchAddresses",
      sentryEndpoint: "/api/v1/addresses",
    },
    queryFn: ({ signal }) => fetchAddresses({ signal }),
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const data = query.data ?? createEmptyAddressesResponse();

  return {
    ...query,
    data,
    addresses: data.items,
  };
}

export function useCreateAddress() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createAddressRequest,
    meta: {
      sentryName: "createAddress",
      sentryEndpoint: "/api/v1/addresses",
    },
    onSuccess: async (result) => {
      queryClient.setQueryData<AddressesListResponse | undefined>(
        DASHBOARD_ADDRESSES_QUERY_KEY,
        (current) => upsertAddressInCache(current, result)
      );
      await queryClient.invalidateQueries({
        queryKey: DASHBOARD_ADDRESSES_QUERY_KEY,
      });
    },
  });

  return {
    ...mutation,
    createAddress: mutation.mutateAsync,
  };
}

export function useUpdateAddress() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateAddressRequest,
    meta: {
      sentryName: "updateAddress",
      sentryEndpoint: "/api/v1/addresses/:id",
    },
    onSuccess: async (result) => {
      queryClient.setQueryData<AddressesListResponse | undefined>(
        DASHBOARD_ADDRESSES_QUERY_KEY,
        (current) => upsertAddressInCache(current, result)
      );
      await queryClient.invalidateQueries({
        queryKey: DASHBOARD_ADDRESSES_QUERY_KEY,
      });
    },
  });

  return {
    ...mutation,
    updateAddress: mutation.mutateAsync,
  };
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteAddressRequest,
    meta: {
      sentryName: "deleteAddress",
      sentryEndpoint: "/api/v1/addresses/:id",
    },
    onSuccess: async (result) => {
      queryClient.setQueryData<AddressesListResponse | undefined>(
        DASHBOARD_ADDRESSES_QUERY_KEY,
        (current) => removeAddressFromCache(current, result.id)
      );
      await queryClient.invalidateQueries({
        queryKey: DASHBOARD_ADDRESSES_QUERY_KEY,
      });
    },
  });

  return {
    ...mutation,
    deleteAddress: mutation.mutateAsync,
  };
}
