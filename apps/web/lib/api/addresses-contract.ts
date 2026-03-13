import {
  type AddressesListResponse,
  AddressesListResponseSchema,
  type CreateAddressResponse,
  CreateAddressResponseSchema,
  type DeleteAddressResponse,
  DeleteAddressResponseSchema,
  type UpdateAddressResponse,
  UpdateAddressResponseSchema,
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

export function normalizeAddressesListPayload(payload: unknown): AddressesListResponse {
  const parsed = parseWithEnvelope(payload, AddressesListResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize addresses response");
}

export function normalizeCreateAddressPayload(payload: unknown): CreateAddressResponse {
  const parsed = parseWithEnvelope(payload, CreateAddressResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize address creation response");
}

export function normalizeUpdateAddressPayload(payload: unknown): UpdateAddressResponse {
  const parsed = parseWithEnvelope(payload, UpdateAddressResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize address update response");
}

export function normalizeDeleteAddressPayload(payload: unknown): DeleteAddressResponse {
  const parsed = parseWithEnvelope(payload, DeleteAddressResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize address deletion response");
}
