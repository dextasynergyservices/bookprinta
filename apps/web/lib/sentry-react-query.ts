import * as Sentry from "@sentry/nextjs";
import type { Mutation, Query } from "@tanstack/react-query";

type SentryMeta = {
  sentry?: boolean;
  sentryEndpoint?: string;
  sentryName?: string;
};

function parseStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const candidates = [
    (error as { status?: unknown }).status,
    (error as { statusCode?: unknown }).statusCode,
    (error as { response?: { status?: unknown } }).response?.status,
    (error as { cause?: { status?: unknown } }).cause?.status,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return "UnknownError";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isAbortLikeError(error: unknown): boolean {
  const name = getErrorName(error).toLowerCase();
  const message = getErrorMessage(error).toLowerCase();

  return (
    name.includes("abort") ||
    name.includes("cancel") ||
    message.includes("aborted") ||
    message.includes("canceled")
  );
}

function stringifyKey(key: unknown): string {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error));
}

function getLevel(statusCode: number | null): "warning" | "error" {
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return "warning";
  }

  return "error";
}

function shouldCapture(error: unknown, meta?: SentryMeta): boolean {
  if (meta?.sentry === false) return false;
  if (isAbortLikeError(error)) return false;
  return true;
}

export function captureReactQueryError(
  error: unknown,
  query: Query<unknown, unknown, unknown, readonly unknown[]>
): void {
  const meta = query.meta as SentryMeta | undefined;
  if (!shouldCapture(error, meta)) return;

  const statusCode = parseStatusCode(error);
  const queryKey = stringifyKey(query.queryKey);
  const captureError = toError(error);

  Sentry.withScope((scope) => {
    scope.setLevel(getLevel(statusCode));
    scope.setTag("layer", "web");
    scope.setTag("source", "react-query");
    scope.setTag("operation", "query");
    scope.setTag("query_hash", query.queryHash);

    if (statusCode) {
      scope.setTag("status_code", String(statusCode));
    }
    if (meta?.sentryEndpoint) {
      scope.setTag("endpoint", meta.sentryEndpoint);
    }
    if (meta?.sentryName) {
      scope.setTag("operation_name", meta.sentryName);
    }

    scope.setContext("react_query", {
      type: "query",
      queryKey,
      status: query.state.status,
      fetchStatus: query.state.fetchStatus,
      failureCount: query.state.fetchFailureCount,
      endpoint: meta?.sentryEndpoint,
      operationName: meta?.sentryName,
    });

    Sentry.captureException(captureError);
  });
}

export function captureReactMutationError(
  error: unknown,
  mutation: Mutation<unknown, unknown, unknown, unknown>
): void {
  const meta = mutation.options.meta as SentryMeta | undefined;
  if (!shouldCapture(error, meta)) return;

  const statusCode = parseStatusCode(error);
  const mutationKey = stringifyKey(mutation.options.mutationKey ?? "unknown");
  const captureError = toError(error);

  Sentry.withScope((scope) => {
    scope.setLevel(getLevel(statusCode));
    scope.setTag("layer", "web");
    scope.setTag("source", "react-query");
    scope.setTag("operation", "mutation");
    scope.setTag("mutation_id", String(mutation.mutationId));

    if (statusCode) {
      scope.setTag("status_code", String(statusCode));
    }
    if (meta?.sentryEndpoint) {
      scope.setTag("endpoint", meta.sentryEndpoint);
    }
    if (meta?.sentryName) {
      scope.setTag("operation_name", meta.sentryName);
    }

    scope.setContext("react_query", {
      type: "mutation",
      mutationKey,
      status: mutation.state.status,
      failureCount: mutation.state.failureCount,
      endpoint: meta?.sentryEndpoint,
      operationName: meta?.sentryName,
      hasVariables: mutation.state.variables !== undefined,
    });

    Sentry.captureException(captureError);
  });
}
