import type {
  AdminSystemPaymentGateway,
  AdminSystemPaymentGatewayListResponse,
  AdminSystemSettingKey,
  AdminSystemSettingListItem,
  AdminSystemSettingsListResponse,
  AdminSystemUpdatePaymentGatewayBodyInput,
  AdminSystemUpdateSettingBodyInput,
  ProductionDelayStatusResponse,
  UpdateProductionDelayBodyInput,
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

export type AdminSettingsErrorState = {
  title: string;
  description: string;
  fieldErrors: Record<string, string>;
};

export class AdminSettingsRequestError extends Error {
  title: string;
  fieldErrors: Record<string, string>;

  constructor(input: { title: string; description: string; fieldErrors?: Record<string, string> }) {
    super(input.description);
    this.name = "AdminSettingsRequestError";
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

async function throwAdminSettingsError(response: Response, fallback: string): Promise<never> {
  const payload = await readApiPayload(response);
  const description = extractMessage(payload, fallback);
  const fieldErrors = toFieldErrors(payload);

  throw new AdminSettingsRequestError({
    title: "Action failed",
    description,
    fieldErrors,
  });
}

function sortGateways(gateways: AdminSystemPaymentGateway[]): AdminSystemPaymentGateway[] {
  return gateways.slice().sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.name.localeCompare(right.name);
  });
}

export function normalizeAdminSettingsError(error: unknown): AdminSettingsErrorState {
  if (error instanceof AdminSettingsRequestError) {
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

export async function fetchAdminSystemSettings(
  input: { signal?: AbortSignal } = {}
): Promise<AdminSystemSettingsListResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/system/settings", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load system settings right now.");
  }

  if (!response.ok) {
    await throwAdminSettingsError(response, "Unable to load system settings");
  }

  return (await response.json()) as AdminSystemSettingsListResponse;
}

export async function updateAdminSystemSetting(input: {
  key: AdminSystemSettingKey;
  body: AdminSystemUpdateSettingBodyInput;
}): Promise<AdminSystemSettingListItem> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/system/settings/${encodeURIComponent(input.key)}`,
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
    throw new Error("Unable to update system setting right now.");
  }

  if (!response.ok) {
    await throwAdminSettingsError(response, "Unable to update system setting");
  }

  return (await response.json()) as AdminSystemSettingListItem;
}

export async function fetchAdminSystemPaymentGateways(
  input: { signal?: AbortSignal } = {}
): Promise<AdminSystemPaymentGatewayListResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/system/payment-gateways", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load payment gateways right now.");
  }

  if (!response.ok) {
    await throwAdminSettingsError(response, "Unable to load payment gateways");
  }

  const data = (await response.json()) as AdminSystemPaymentGatewayListResponse;
  return {
    ...data,
    gateways: sortGateways(data.gateways),
  };
}

export async function updateAdminSystemPaymentGateway(input: {
  gatewayId: string;
  body: AdminSystemUpdatePaymentGatewayBodyInput;
}): Promise<AdminSystemPaymentGateway> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/system/payment-gateways/${encodeURIComponent(input.gatewayId)}`,
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
    throw new Error("Unable to update payment gateway right now.");
  }

  if (!response.ok) {
    await throwAdminSettingsError(response, "Unable to update payment gateway");
  }

  const gateway = (await response.json()) as AdminSystemPaymentGateway;
  return gateway;
}

export async function fetchAdminProductionStatus(input: { signal?: AbortSignal } = {}) {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/system/production-status", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load production status right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load production status");
  }

  return (await response.json()) as ProductionDelayStatusResponse;
}

export async function updateAdminProductionDelayOverride(input: {
  body: UpdateProductionDelayBodyInput;
}): Promise<ProductionDelayStatusResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/system/production-delay", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    });
  } catch {
    throw new Error("Unable to update production delay override right now.");
  }

  if (!response.ok) {
    await throwAdminSettingsError(response, "Unable to update production delay override");
  }

  return (await response.json()) as ProductionDelayStatusResponse;
}
