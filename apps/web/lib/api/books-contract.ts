import type { UserBooksListResponse } from "@bookprinta/shared";
import { UserBooksListResponseSchema } from "@bookprinta/shared";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function createEmptyUserBooksListResponse(page = 1, pageSize = 10): UserBooksListResponse {
  return {
    items: [],
    pagination: {
      page,
      pageSize,
      totalItems: 0,
      totalPages: 0,
      hasPreviousPage: page > 1,
      hasNextPage: false,
    },
  };
}

export function normalizeUserBooksListPayload(
  payload: unknown,
  options: {
    requestedPage?: number;
    requestedPageSize?: number;
  } = {}
): UserBooksListResponse {
  const requestedPage = options.requestedPage ?? 1;
  const requestedPageSize = options.requestedPageSize ?? 10;
  const root = toRecord(payload);
  const candidates: unknown[] = [payload, root?.data, root?.books];

  for (const candidate of candidates) {
    const parsed = UserBooksListResponseSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return createEmptyUserBooksListResponse(requestedPage, requestedPageSize);
}
