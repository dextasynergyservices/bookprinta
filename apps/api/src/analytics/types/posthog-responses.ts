/**
 * PostHog HogQL Query API response types.
 *
 * These represent the raw JSON shapes returned by
 * POST /api/projects/:id/query with kind: "HogQLQuery".
 */

export interface PostHogHogQLResponse {
  results: unknown[][];
  columns: string[];
  types: string[];
  hasMore?: boolean;
}

export interface PostHogQueryPayload {
  query: {
    kind: "HogQLQuery";
    query: string;
  };
}
