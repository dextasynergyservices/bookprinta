import type {
  AdminDashboardChartsQuery,
  AdminDashboardChartsResponse,
  AdminDashboardStatsQuery,
  AdminDashboardStatsResponse,
} from "@bookprinta/shared";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

type ApiErrorPayload = {
  message?: unknown;
  error?: {
    message?: unknown;
  };
  errors?: Record<string, unknown>;
  fieldErrors?: Record<string, unknown>;
};

export type AdminAnalyticsErrorState = {
  title: string;
  description: string;
  fieldErrors: Record<string, string>;
};

export class AdminAnalyticsRequestError extends Error {
  title: string;
  fieldErrors: Record<string, string>;

  constructor(input: { title: string; description: string; fieldErrors?: Record<string, string> }) {
    super(input.description);
    this.name = "AdminAnalyticsRequestError";
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

async function throwAdminAnalyticsError(response: Response, fallback: string): Promise<never> {
  const payload = await readApiPayload(response);
  const description = extractMessage(payload, fallback);
  const fieldErrors = toFieldErrors(payload);

  throw new AdminAnalyticsRequestError({
    title: "Action failed",
    description,
    fieldErrors,
  });
}

function buildDashboardSearchParams(
  query: AdminDashboardStatsQuery | AdminDashboardChartsQuery
): URLSearchParams {
  const params = new URLSearchParams();

  if (query.range) {
    params.set("range", query.range);
  }

  if (query.from) {
    params.set("from", query.from);
  }

  if (query.to) {
    params.set("to", query.to);
  }

  return params;
}

export function normalizeAdminAnalyticsError(error: unknown): AdminAnalyticsErrorState {
  if (error instanceof AdminAnalyticsRequestError) {
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
    description: "Unable to load analytics right now.",
    fieldErrors: {},
  };
}

export async function fetchAdminDashboardStats(
  query: AdminDashboardStatsQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminDashboardStatsResponse> {
  let response: Response;

  try {
    const params = buildDashboardSearchParams(query);
    response = await fetchApiV1WithRefresh(`/admin/system/dashboard/stats?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load dashboard stats right now.");
  }

  if (!response.ok) {
    await throwAdminAnalyticsError(response, "Unable to load dashboard stats");
  }

  return (await response.json()) as AdminDashboardStatsResponse;
}

export async function fetchAdminDashboardCharts(
  query: AdminDashboardChartsQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminDashboardChartsResponse> {
  let response: Response;

  try {
    const params = buildDashboardSearchParams(query);
    response = await fetchApiV1WithRefresh(`/admin/system/dashboard/charts?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load dashboard charts right now.");
  }

  if (!response.ok) {
    await throwAdminAnalyticsError(response, "Unable to load dashboard charts");
  }

  return (await response.json()) as AdminDashboardChartsResponse;
}
