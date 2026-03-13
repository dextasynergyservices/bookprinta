import {
  type BookReprintConfigResponse,
  BookReprintConfigResponseSchema,
} from "@bookprinta/shared";
import type { ZodType } from "zod";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseWithEnvelope<T>(payload: unknown, schema: ZodType<T>): T | null {
  const direct = schema.safeParse(payload);
  if (direct.success) {
    return direct.data;
  }

  const root = toRecord(payload);
  if (!root || !("data" in root)) {
    return null;
  }

  const enveloped = schema.safeParse(root.data);
  return enveloped.success ? enveloped.data : null;
}

export function normalizeBookReprintConfigPayload(payload: unknown): BookReprintConfigResponse {
  const parsed = parseWithEnvelope(payload, BookReprintConfigResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize book reprint config response");
}
