"use client";

import type {
  AdminDeleteUserResponse,
  AdminUpdateUserInput,
  AdminUpdateUserResponse,
} from "@bookprinta/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminUsersQueryKeys } from "./useAdminUsers";

type UpdateAdminUserVariables = {
  userId: string;
  input: AdminUpdateUserInput;
};

type DeleteAdminUserVariables = {
  userId: string;
};

type ReactivateAdminUserVariables = {
  userId: string;
};

async function updateAdminUser({
  userId,
  input,
}: UpdateAdminUserVariables): Promise<AdminUpdateUserResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/users/${userId}`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to update the user right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update the user");
  }

  return (await response.json()) as AdminUpdateUserResponse;
}

async function deleteAdminUser({
  userId,
}: DeleteAdminUserVariables): Promise<AdminDeleteUserResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/users/${userId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to delete the user right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete the user");
  }

  return (await response.json()) as AdminDeleteUserResponse;
}

async function reactivateAdminUser({
  userId,
}: ReactivateAdminUserVariables): Promise<AdminUpdateUserResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/users/${userId}/reactivate`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to reactivate the user right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to reactivate the user");
  }

  return (await response.json()) as AdminUpdateUserResponse;
}

export function useAdminUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, input }: UpdateAdminUserVariables) =>
      updateAdminUser({
        userId,
        input,
      }),
    onSuccess: async (_response, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminUsersQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: adminUsersQueryKeys.detail(variables.userId),
        }),
      ]);
    },
  });
}

export function useAdminDeleteUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: DeleteAdminUserVariables) =>
      deleteAdminUser({
        userId,
      }),
    onSuccess: async (_response, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminUsersQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: adminUsersQueryKeys.detail(variables.userId),
        }),
      ]);
    },
  });
}

export function useAdminReactivateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: ReactivateAdminUserVariables) =>
      reactivateAdminUser({
        userId,
      }),
    onSuccess: async (_response, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminUsersQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: adminUsersQueryKeys.detail(variables.userId),
        }),
      ]);
    },
  });
}
