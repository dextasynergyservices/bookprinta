import {
  type ChangeMyPasswordResponse,
  ChangeMyPasswordResponseSchema,
  type DeleteMyProfileImageResponse,
  DeleteMyProfileImageResponseSchema,
  type MyProfileResponse,
  MyProfileResponseSchema,
  type RequestMyProfileImageUploadResponse,
  RequestMyProfileImageUploadResponseSchema,
  type UpdateMyLanguageResponse,
  UpdateMyLanguageResponseSchema,
  type UpdateMyNotificationPreferencesResponse,
  UpdateMyNotificationPreferencesResponseSchema,
  type UpdateMyProfileResponse,
  UpdateMyProfileResponseSchema,
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

export function normalizeMyProfilePayload(payload: unknown): MyProfileResponse {
  const parsed = parseWithEnvelope(payload, MyProfileResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize profile response");
}

export function normalizeUpdateMyProfilePayload(payload: unknown): UpdateMyProfileResponse {
  const parsed = parseWithEnvelope(payload, UpdateMyProfileResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize profile update response");
}

export function normalizeRequestMyProfileImageUploadPayload(
  payload: unknown
): RequestMyProfileImageUploadResponse {
  const parsed = parseWithEnvelope(payload, RequestMyProfileImageUploadResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize profile image response");
}

export function normalizeDeleteMyProfileImagePayload(
  payload: unknown
): DeleteMyProfileImageResponse {
  const parsed = parseWithEnvelope(payload, DeleteMyProfileImageResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize profile image deletion response");
}

export function normalizeUpdateMyLanguagePayload(payload: unknown): UpdateMyLanguageResponse {
  const parsed = parseWithEnvelope(payload, UpdateMyLanguageResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize language update response");
}

export function normalizeChangeMyPasswordPayload(payload: unknown): ChangeMyPasswordResponse {
  const parsed = parseWithEnvelope(payload, ChangeMyPasswordResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize password change response");
}

export function normalizeUpdateMyNotificationPreferencesPayload(
  payload: unknown
): UpdateMyNotificationPreferencesResponse {
  const parsed = parseWithEnvelope(payload, UpdateMyNotificationPreferencesResponseSchema);
  if (parsed) {
    return parsed;
  }

  throw new Error("Unable to normalize notification preferences response");
}
