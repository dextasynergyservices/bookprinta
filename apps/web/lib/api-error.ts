const DEFAULT_RETRY_AFTER_SECONDS = 60;

type ErrorPayload = {
  message?: unknown;
  retryAfter?: unknown;
  errorCode?: unknown;
};

function normalizeRetryAfter(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.ceil(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.ceil(parsed);
    }
  }

  return null;
}

function extractMessage(payload: ErrorPayload | null, fallback: string): string {
  if (typeof payload?.message === "string" && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (Array.isArray(payload?.message)) {
    const joined = payload.message
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(", ");
    if (joined.length > 0) return joined;
  }

  return fallback;
}

function extractRetryAfterSeconds(response: Response, payload: ErrorPayload | null): number {
  const fromBody = normalizeRetryAfter(payload?.retryAfter);
  if (fromBody !== null) return fromBody;

  const fromHeader = normalizeRetryAfter(response.headers.get("retry-after"));
  if (fromHeader !== null) return fromHeader;

  return DEFAULT_RETRY_AFTER_SECONDS;
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

/**
 * An API failure that carries the server's machine-readable `errorCode`, so a
 * caller can show a translated message instead of the server's English text.
 */
export class ApiRequestError extends Error {
  status: number;
  errorCode: string | null;

  constructor(message: string, status: number, errorCode: string | null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export function toRetryAfterMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}

export async function throwApiError(
  response: Response,
  fallback = "Request failed"
): Promise<never> {
  const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
  const message = extractMessage(payload, fallback);

  if (response.status === 429) {
    throw new RateLimitError(message, extractRetryAfterSeconds(response, payload));
  }

  const errorCode = typeof payload?.errorCode === "string" ? payload.errorCode : null;
  throw new ApiRequestError(message, response.status, errorCode);
}
