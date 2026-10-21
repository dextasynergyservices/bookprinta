export function getApiV1BaseUrl(): string {
  // Client-side: use same-origin path (proxied by Vercel rewrites to Render).
  // This makes auth cookies first-party, avoiding cross-origin cookie issues.
  if (typeof window !== "undefined") return "/api/v1";

  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function buildApiV1Url(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiV1BaseUrl()}${normalizedPath}`;
}

/**
 * The refresh currently in flight, shared by every caller that needs one.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * The API rotates refresh tokens: each successful `/auth/refresh` issues a new
 * token and stores only the new digest, so the previous token stops working.
 * That is correct and worth keeping.
 *
 * But the dashboard fires several queries in parallel (unread count, books,
 * orders, notifications). When the 15-minute access token expires, they all
 * return 401 at once, and without coordination each one POSTs `/auth/refresh`
 * with the SAME refresh token. Every call validates (same token), then every
 * call writes a different new digest. Last write wins in the database, last
 * response wins in the cookie jar — and when those two orders differ, the
 * cookie no longer matches the stored digest.
 *
 * The user does not notice immediately: they still receive a valid access token
 * and keep working for 15 minutes. The mismatch only surfaces at the NEXT
 * refresh, which fails and logs them out. A delayed, intermittent logout with
 * no obvious cause.
 *
 * Sharing one in-flight request means exactly one rotation happens per expiry,
 * so there is nothing to race. It also removes N-1 redundant round trips and
 * N-1 database writes every time a token expires.
 *
 * Module scope is the right scope: the refresh token lives in an HttpOnly
 * cookie shared across the whole browsing context, so coordinating per module
 * instance matches the resource being protected. Separate tabs are separate
 * contexts, but they also pick up each other's refreshed cookie, so the
 * remaining overlap is a rare simultaneous-expiry case rather than the routine
 * parallel-query one.
 */
let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Perform at most one refresh at a time; concurrent callers await the same one.
 *
 * Resolves to whether the session was successfully refreshed. Never rejects —
 * a network failure is reported as `false` so callers fall back to surfacing
 * the original 401 rather than throwing something unexpected at the UI.
 */
function refreshSessionOnce(refreshUrl: string): Promise<boolean> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    try {
      const response = await fetch(refreshUrl, {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared so the NEXT expiry starts a fresh attempt. Callers that joined
      // before this ran still receive this promise's result, and any that
      // arrive afterwards correctly begin a new refresh.
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

export async function fetchWithRefreshRetry(
  requestUrl: string,
  refreshUrl: string,
  init: RequestInit
): Promise<Response> {
  const firstResponse = await fetch(requestUrl, init);

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const refreshed = await refreshSessionOnce(refreshUrl);

  if (!refreshed) {
    return firstResponse;
  }

  // Retried once only. A second 401 here means the new token is genuinely not
  // accepted, so returning it lets the caller handle the failure instead of
  // looping.
  return fetch(requestUrl, init);
}

export async function fetchApiV1WithRefresh(path: string, init: RequestInit): Promise<Response> {
  const apiBase = getApiV1BaseUrl();
  return fetchWithRefreshRetry(buildApiV1Url(path), `${apiBase}/auth/refresh`, init);
}
