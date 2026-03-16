"use client";

import type { AdminUpdateUserInput, AdminUpdateUserResponse } from "@bookprinta/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { adminUsersQueryKeys } from "./useAdminUsers";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

type UpdateAdminUserVariables = {
  userId: string;
  input: AdminUpdateUserInput;
};

async function updateAdminUser({
  userId,
  input,
}: UpdateAdminUserVariables): Promise<AdminUpdateUserResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_V1_BASE_URL}/admin/users/${userId}`, {
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
