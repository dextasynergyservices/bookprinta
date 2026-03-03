import type { ThrottlerGetTrackerFunction } from "@nestjs/throttler";

type RequestLike = Record<string, unknown> & {
  body?: unknown;
  headers?: unknown;
  ip?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function extractForwardedIp(headers: unknown): string | null {
  const record = asRecord(headers);
  if (!record) return null;

  const rawForwarded = record["x-forwarded-for"];

  if (typeof rawForwarded === "string") {
    const firstIp = rawForwarded.split(",")[0]?.trim();
    return firstIp ? firstIp : null;
  }

  if (Array.isArray(rawForwarded)) {
    const first = rawForwarded[0];
    if (typeof first === "string") {
      const normalized = first.trim();
      return normalized.length > 0 ? normalized : null;
    }
  }

  return null;
}

function extractRequestIp(req: RequestLike): string {
  const forwarded = extractForwardedIp(req.headers);
  if (forwarded) return forwarded;

  if (typeof req.ip === "string") {
    const normalized = req.ip.trim();
    if (normalized.length > 0) return normalized;
  }

  return "unknown";
}

export const getIpTracker: ThrottlerGetTrackerFunction = (req) => {
  return extractRequestIp(req as RequestLike);
};

export const getNormalizedEmailTracker: ThrottlerGetTrackerFunction = (req) => {
  const request = req as RequestLike;
  const body = asRecord(request.body);
  const email = body ? normalizeEmail(body.email) : null;

  if (email) {
    return `email:${email}`;
  }

  return `ip:${extractRequestIp(request)}`;
};
