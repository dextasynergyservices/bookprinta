"use client";

import type {
  AdminArchiveQuoteInput,
  AdminDeleteQuoteInput,
  AdminDeleteQuoteResponse,
  AdminQuoteActionResponse,
  AdminQuoteDetail,
  AdminQuotePatchInput,
  AdminQuotePatchResponse,
  AdminRejectQuoteInput,
  AdminRevokeQuotePaymentLinkInput,
  GenerateQuotePaymentLinkInput,
  GenerateQuotePaymentLinkResponse,
  RevokeQuotePaymentLinkResponse,
} from "@bookprinta/shared";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminQuotesQueryKeys } from "./useAdminQuotes";

type PatchAdminQuoteVariables = {
  quoteId: string;
  input: AdminQuotePatchInput;
};

type GenerateQuotePaymentLinkVariables = {
  quoteId: string;
  input: GenerateQuotePaymentLinkInput;
};

type RevokeQuotePaymentLinkVariables = {
  quoteId: string;
  input: AdminRevokeQuotePaymentLinkInput;
};

type RejectQuoteVariables = {
  quoteId: string;
  input: AdminRejectQuoteInput;
};

type ArchiveQuoteVariables = {
  quoteId: string;
  input: AdminArchiveQuoteInput;
};

type DeleteQuoteVariables = {
  quoteId: string;
  input: AdminDeleteQuoteInput;
};

type PatchAdminQuoteContext = {
  previousDetail: AdminQuoteDetail | null;
};

async function invalidateAdminQuoteQueries(queryClient: QueryClient, quoteId: string) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminQuotesQueryKeys.lists(),
    }),
    queryClient.invalidateQueries({
      queryKey: adminQuotesQueryKeys.detail(quoteId),
    }),
  ]);
}

async function patchAdminQuote({
  quoteId,
  input,
}: PatchAdminQuoteVariables): Promise<AdminQuotePatchResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes/${quoteId}`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to update the quote right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update the quote");
  }

  return (await response.json()) as AdminQuotePatchResponse;
}

async function generateQuotePaymentLink({
  quoteId,
  input,
}: GenerateQuotePaymentLinkVariables): Promise<GenerateQuotePaymentLinkResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes/${quoteId}/payment-link`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to generate a payment link right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to generate quote payment link");
  }

  return (await response.json()) as GenerateQuotePaymentLinkResponse;
}

async function revokeQuotePaymentLink({
  quoteId,
  input,
}: RevokeQuotePaymentLinkVariables): Promise<RevokeQuotePaymentLinkResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes/${quoteId}/payment-link`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to revoke the payment link right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to revoke quote payment link");
  }

  return (await response.json()) as RevokeQuotePaymentLinkResponse;
}

async function rejectQuote({
  quoteId,
  input,
}: RejectQuoteVariables): Promise<AdminQuoteActionResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes/${quoteId}/reject`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to reject the quote right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to reject quote");
  }

  return (await response.json()) as AdminQuoteActionResponse;
}

async function archiveQuote({
  quoteId,
  input,
}: ArchiveQuoteVariables): Promise<AdminQuoteActionResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes/${quoteId}/archive`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to archive the quote right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to archive quote");
  }

  return (await response.json()) as AdminQuoteActionResponse;
}

async function deleteQuote({
  quoteId,
  input,
}: DeleteQuoteVariables): Promise<AdminDeleteQuoteResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/quotes/${quoteId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to delete the quote right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete quote");
  }

  return (await response.json()) as AdminDeleteQuoteResponse;
}

export function useAdminQuotePatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quoteId, input }: PatchAdminQuoteVariables) =>
      patchAdminQuote({
        quoteId,
        input,
      }),
    onMutate: async (variables): Promise<PatchAdminQuoteContext> => {
      const detailKey = adminQuotesQueryKeys.detail(variables.quoteId);

      await queryClient.cancelQueries({
        queryKey: detailKey,
      });

      const previousDetail = queryClient.getQueryData<AdminQuoteDetail>(detailKey) ?? null;

      if (previousDetail) {
        queryClient.setQueryData<AdminQuoteDetail>(detailKey, {
          ...previousDetail,
          adminNotes:
            variables.input.adminNotes === undefined
              ? previousDetail.adminNotes
              : variables.input.adminNotes,
          finalPrice:
            variables.input.finalPrice === undefined
              ? previousDetail.finalPrice
              : variables.input.finalPrice,
          contact: {
            fullName: previousDetail.contact.fullName,
            email:
              variables.input.email === undefined
                ? previousDetail.contact.email
                : variables.input.email,
            phone:
              variables.input.phone === undefined
                ? previousDetail.contact.phone
                : variables.input.phone,
          },
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousDetail };
    },
    onError: (_error, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(
          adminQuotesQueryKeys.detail(variables.quoteId),
          context.previousDetail
        );
      }
    },
    onSuccess: (response, variables) => {
      const detailKey = adminQuotesQueryKeys.detail(variables.quoteId);
      const previousDetail = queryClient.getQueryData<AdminQuoteDetail>(detailKey);

      if (previousDetail) {
        queryClient.setQueryData<AdminQuoteDetail>(detailKey, {
          ...previousDetail,
          status: response.status,
          adminNotes: response.adminNotes,
          finalPrice: response.finalPrice,
          contact: {
            fullName: previousDetail.contact.fullName,
            email: response.contact.email,
            phone: response.contact.phone,
          },
          updatedAt: response.updatedAt,
        });
      }
    },
    onSettled: async (_response, _error, variables) => {
      await invalidateAdminQuoteQueries(queryClient, variables.quoteId);
    },
  });
}

export function useAdminGenerateQuotePaymentLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quoteId, input }: GenerateQuotePaymentLinkVariables) =>
      generateQuotePaymentLink({
        quoteId,
        input,
      }),
    onSuccess: async (_response, variables) => {
      await invalidateAdminQuoteQueries(queryClient, variables.quoteId);
    },
  });
}

export function useAdminRevokeQuotePaymentLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quoteId, input }: RevokeQuotePaymentLinkVariables) =>
      revokeQuotePaymentLink({
        quoteId,
        input,
      }),
    onSuccess: async (_response, variables) => {
      await invalidateAdminQuoteQueries(queryClient, variables.quoteId);
    },
  });
}

export function useAdminRejectQuoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quoteId, input }: RejectQuoteVariables) => rejectQuote({ quoteId, input }),
    onSuccess: async (_response, variables) => {
      await invalidateAdminQuoteQueries(queryClient, variables.quoteId);
    },
  });
}

export function useAdminArchiveQuoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quoteId, input }: ArchiveQuoteVariables) => archiveQuote({ quoteId, input }),
    onSuccess: async (_response, variables) => {
      await invalidateAdminQuoteQueries(queryClient, variables.quoteId);
    },
  });
}

export function useAdminDeleteQuoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quoteId, input }: DeleteQuoteVariables) => deleteQuote({ quoteId, input }),
    onSuccess: async (_response, variables) => {
      await invalidateAdminQuoteQueries(queryClient, variables.quoteId);
    },
  });
}

export function useAdminQuoteActions() {
  const patch = useAdminQuotePatchMutation();
  const generate = useAdminGenerateQuotePaymentLinkMutation();
  const revoke = useAdminRevokeQuotePaymentLinkMutation();

  return {
    patch,
    generate,
    revoke,
  };
}
