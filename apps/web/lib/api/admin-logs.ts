import type {
  AdminAuditLogsQuery,
  AdminAuditLogsResponse,
  AdminErrorLogActionBodyInput,
  AdminErrorLogActionResponse,
  AdminErrorLogsQuery,
  AdminErrorLogsResponse,
} from "@bookprinta/shared";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

type ApiErrorPayload = {
  message?: unknown;
  error?: {
    message?: unknown;
  };
  errors?: Record<string, unknown>;
  fieldErrors?: Record<string, unknown>;
};

export type AdminLogsErrorState = {
  title: string;
  description: string;
  fieldErrors: Record<string, string>;
};

export class AdminLogsRequestError extends Error {
  title: string;
  fieldErrors: Record<string, string>;

  constructor(input: { title: string; description: string; fieldErrors?: Record<string, string> }) {
    super(input.description);
    this.name = "AdminLogsRequestError";
    this.title = input.title;
    this.fieldErrors = input.fieldErrors ?? {};
  }
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

function toStringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function extractMessage(payload: ApiErrorPayload | null, fallback: string): string {
  const nested = payload?.error?.message;
  if (typeof nested === "string" && nested.trim().length > 0) {
    return nested.trim();
  }

  const messageValue = payload?.message;
  if (typeof messageValue === "string" && messageValue.trim().length > 0) {
    return messageValue.trim();
  }

  const messageList = toStringList(messageValue);
  if (messageList.length > 0) {
    return messageList.join(", ");
  }

  return fallback;
}

function toFieldErrors(payload: ApiErrorPayload | null): Record<string, string> {
  const source = payload?.fieldErrors ?? payload?.errors;
  if (!source || typeof source !== "object") {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim().length > 0) {
      result[key] = value.trim();
      continue;
    }

    const list = toStringList(value);
    if (list.length > 0) {
      result[key] = list.join(", ");
    }
  }

  return result;
}

async function readApiPayload(response: Response): Promise<ApiErrorPayload | null> {
  return (await response.json().catch(() => null)) as ApiErrorPayload | null;
}

async function throwAdminLogsError(response: Response, fallback: string): Promise<never> {
  const payload = await readApiPayload(response);
  const description = extractMessage(payload, fallback);
  const fieldErrors = toFieldErrors(payload);

  throw new AdminLogsRequestError({
    title: "Action failed",
    description,
    fieldErrors,
  });
}

function buildAuditLogsSearchParams(query: AdminAuditLogsQuery): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(query.limit ?? 25),
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.action) params.set("action", query.action);
  if (query.userId) params.set("userId", query.userId);
  if (query.entityType) params.set("entityType", query.entityType);
  if (query.entityId) params.set("entityId", query.entityId);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.q) params.set("q", query.q);

  return params;
}

function buildErrorLogsSearchParams(query: AdminErrorLogsQuery): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(query.limit ?? 25),
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.severity) params.set("severity", query.severity);
  if (query.status) params.set("status", query.status);
  if (query.service) params.set("service", query.service);
  if (query.ownerUserId) params.set("ownerUserId", query.ownerUserId);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.q) params.set("q", query.q);

  return params;
}

export function normalizeAdminLogsError(error: unknown): AdminLogsErrorState {
  if (error instanceof AdminLogsRequestError) {
    return {
      title: error.title,
      description: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      title: "Action failed",
      description: error.message,
      fieldErrors: {},
    };
  }

  return {
    title: "Action failed",
    description: "Unable to complete this action right now.",
    fieldErrors: {},
  };
}

export async function fetchAdminAuditLogs(
  query: AdminAuditLogsQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminAuditLogsResponse> {
  let response: Response;
  const params = buildAuditLogsSearchParams(query);

  try {
    response = await fetchApiV1WithRefresh(`/admin/system/audit-logs?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load audit logs right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load audit logs");
  }

  return (await response.json()) as AdminAuditLogsResponse;
}

export async function fetchAdminErrorLogs(
  query: AdminErrorLogsQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminErrorLogsResponse> {
  let response: Response;
  const params = buildErrorLogsSearchParams(query);

  try {
    response = await fetchApiV1WithRefresh(`/admin/system/error-logs?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load error logs right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load error logs");
  }

  return (await response.json()) as AdminErrorLogsResponse;
}

export async function updateAdminErrorLogAction(input: {
  id: string;
  body: AdminErrorLogActionBodyInput;
}): Promise<AdminErrorLogActionResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/system/error-logs/${encodeURIComponent(input.id)}`,
      {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
      }
    );
  } catch {
    throw new Error("Unable to update error log right now.");
  }

  if (!response.ok) {
    await throwAdminLogsError(response, "Unable to update error log");
  }

  return (await response.json()) as AdminErrorLogActionResponse;
}
