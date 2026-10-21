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

  // Fail loudly. This used to return an EMPTY list, which meant a server
  // response that no longer matched the schema rendered as "you have no books"
  // — on the one thing the customer paid for. A silent empty state is the worst
  // possible outcome here: it looks like a legitimate answer, so nobody
  // investigates, and the user concludes their book is gone.
  //
  // Throwing routes it into the query's error state, so the UI shows a retry
  // and the failure reaches Sentry. Note a genuinely empty list still PARSES
  // (items: [] satisfies the schema), so this only fires on a real contract
  // mismatch — never on a user with no books.
  //
  // Callers that need a neutral placeholder before data arrives should use
  // createEmptyUserBooksListResponse() directly rather than normalising null.
  // Include the requested window in the message: a contract mismatch is far
  // easier to reproduce when the report says which page failed.
  throw new Error(
    `Unable to load your books right now (page ${requestedPage}, pageSize ${requestedPageSize})`
  );
}
