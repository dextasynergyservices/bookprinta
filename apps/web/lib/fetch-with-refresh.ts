export function getApiV1BaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function buildApiV1Url(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiV1BaseUrl()}${normalizedPath}`;
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

  const refreshResponse = await fetch(refreshUrl, {
    method: "POST",
    credentials: "include",
  });

  if (!refreshResponse.ok) {
    return firstResponse;
  }

  return fetch(requestUrl, init);
}

export async function fetchApiV1WithRefresh(path: string, init: RequestInit): Promise<Response> {
  const apiBase = getApiV1BaseUrl();
  return fetchWithRefreshRetry(buildApiV1Url(path), `${apiBase}/auth/refresh`, init);
}
