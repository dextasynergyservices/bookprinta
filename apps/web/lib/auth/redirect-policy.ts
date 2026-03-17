import { isAdminRole, type UserRoleValue } from "@bookprinta/shared";
import { emitRedirectTelemetry } from "./redirect-telemetry";

const SUPPORTED_LOCALE_PREFIXES = ["en", "fr", "es"] as const;

export const USER_PROTECTED_PREFIX = "/dashboard";
export const ADMIN_PROTECTED_PREFIX = "/admin";

export const AUTH_FALLBACK_ROUTES = {
  user: USER_PROTECTED_PREFIX,
  admin: ADMIN_PROTECTED_PREFIX,
  unauth: "/login",
} as const;

type ProtectedScope = "user" | "admin" | "none";

type ResolvePostLoginRedirectInput = {
  role: UserRoleValue | null | undefined;
  returnTo: string | null | undefined;
  adminToUserPolicy?: AdminToUserReturnPolicy;
};

type BuildLogoutRedirectOptions = {
  preserveReturnToOnLogout?: boolean;
};

export type AdminToUserReturnPolicy = "allow" | "fallback";
export const DEFAULT_ADMIN_TO_USER_RETURN_POLICY: AdminToUserReturnPolicy = "fallback";
export const DEFAULT_PRESERVE_RETURN_TO_ON_LOGOUT = true;

function startsWithPathSegment(pathname: string, segmentPrefix: string): boolean {
  return pathname === segmentPrefix || pathname.startsWith(`${segmentPrefix}/`);
}

function getPathnameOnly(pathWithQueryOrHash: string): string {
  const queryIndex = pathWithQueryOrHash.indexOf("?");
  const hashIndex = pathWithQueryOrHash.indexOf("#");

  if (queryIndex === -1 && hashIndex === -1) {
    return pathWithQueryOrHash;
  }

  if (queryIndex === -1) {
    return pathWithQueryOrHash.slice(0, hashIndex);
  }

  if (hashIndex === -1) {
    return pathWithQueryOrHash.slice(0, queryIndex);
  }

  return pathWithQueryOrHash.slice(0, Math.min(queryIndex, hashIndex));
}

function stripLocalePrefix(pathname: string): string {
  for (const locale of SUPPORTED_LOCALE_PREFIXES) {
    const localePrefix = `/${locale}`;
    if (pathname === localePrefix) return "/";
    if (pathname.startsWith(`${localePrefix}/`)) {
      return pathname.slice(localePrefix.length);
    }
  }

  return pathname;
}

function decodePathCandidate(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return null;

  // Support encoded values like "%2Fdashboard%2Forders%3Ftab%3Dtracking".
  try {
    const decoded = decodeURIComponent(trimmed);
    return decoded.trim();
  } catch {
    // If malformed percent encoding is present, fail closed.
    if (trimmed.includes("%")) {
      return null;
    }

    return trimmed;
  }
}

function hasExternalProtocol(pathname: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(pathname);
}

export function isInternalReturnPath(pathname: string | null | undefined): pathname is string {
  if (typeof pathname !== "string") return false;

  const normalized = pathname.trim();
  if (normalized.length === 0) return false;

  // Internal paths must be absolute app paths and never protocol-relative/external.
  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    hasExternalProtocol(normalized)
  ) {
    return false;
  }

  return true;
}

export function getProtectedScope(pathname: string): ProtectedScope {
  const barePathname = stripLocalePrefix(getPathnameOnly(pathname));

  if (startsWithPathSegment(barePathname, ADMIN_PROTECTED_PREFIX)) return "admin";
  if (startsWithPathSegment(barePathname, USER_PROTECTED_PREFIX)) return "user";
  return "none";
}

export function roleMatchesProtectedScope(
  role: UserRoleValue | null | undefined,
  scope: ProtectedScope
): boolean {
  if (scope === "none") return false;

  if (scope === "admin") {
    return isAdminRole(role);
  }

  return !isAdminRole(role);
}

export function getRoleFallbackRoute(role: UserRoleValue | null | undefined): string {
  return isAdminRole(role) ? AUTH_FALLBACK_ROUTES.admin : AUTH_FALLBACK_ROUTES.user;
}

export function sanitizeReturnTo(rawReturnTo: string | null | undefined): string | null {
  if (typeof rawReturnTo !== "string") {
    return null;
  }

  const decoded = decodePathCandidate(rawReturnTo);
  if (!isInternalReturnPath(decoded)) {
    return null;
  }

  const scope = getProtectedScope(decoded);
  if (scope === "none") {
    return null;
  }

  return decoded;
}

export function buildLoginRedirect(currentPathWithQuery: string | null | undefined): string {
  const returnTo = sanitizeReturnTo(currentPathWithQuery);

  if (!returnTo) {
    emitRedirectTelemetry({
      event: "auth.redirect.login-built",
      outcome: "fallback",
      reason: "invalid-or-unsupported-return-to",
      target: AUTH_FALLBACK_ROUTES.unauth,
      returnTo: currentPathWithQuery ?? null,
    });
    return AUTH_FALLBACK_ROUTES.unauth;
  }

  const loginRedirect = `${AUTH_FALLBACK_ROUTES.unauth}?returnTo=${encodeURIComponent(returnTo)}`;
  emitRedirectTelemetry({
    event: "auth.redirect.login-built",
    outcome: "return-to",
    reason: "valid-protected-path",
    target: loginRedirect,
    returnTo,
  });

  return loginRedirect;
}

export function buildLogoutRedirect(
  currentPathWithQuery: string | null | undefined,
  {
    preserveReturnToOnLogout = DEFAULT_PRESERVE_RETURN_TO_ON_LOGOUT,
  }: BuildLogoutRedirectOptions = {}
): string {
  if (!preserveReturnToOnLogout) {
    emitRedirectTelemetry({
      event: "auth.redirect.logout-built",
      outcome: "fallback",
      reason: "preserve-return-to-disabled",
      target: AUTH_FALLBACK_ROUTES.unauth,
      returnTo: currentPathWithQuery ?? null,
    });
    return AUTH_FALLBACK_ROUTES.unauth;
  }

  const loginRedirect = buildLoginRedirect(currentPathWithQuery);
  emitRedirectTelemetry({
    event: "auth.redirect.logout-built",
    outcome: loginRedirect === AUTH_FALLBACK_ROUTES.unauth ? "fallback" : "return-to",
    reason:
      loginRedirect === AUTH_FALLBACK_ROUTES.unauth
        ? "invalid-or-unsupported-return-to"
        : "valid-protected-path",
    target: loginRedirect,
    returnTo: currentPathWithQuery ?? null,
  });

  return loginRedirect;
}

export function stripLoginRedirectQueryParams(rawSearch: string | null | undefined): string {
  if (typeof rawSearch !== "string" || rawSearch.trim().length === 0) {
    return "";
  }

  const normalizedSearch = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  const params = new URLSearchParams(normalizedSearch);

  params.delete("returnTo");
  params.delete("next");

  const nextSearch = params.toString();
  return nextSearch.length > 0 ? `?${nextSearch}` : "";
}

export function resolvePostLoginRedirect({
  role,
  returnTo,
  adminToUserPolicy = DEFAULT_ADMIN_TO_USER_RETURN_POLICY,
}: ResolvePostLoginRedirectInput): string {
  const sanitizedReturnTo = sanitizeReturnTo(returnTo);
  const fallbackRoute = getRoleFallbackRoute(role);

  if (!sanitizedReturnTo) {
    emitRedirectTelemetry({
      event: "auth.redirect.post-login",
      outcome: "fallback",
      reason: "invalid-or-unsupported-return-to",
      role: role ?? undefined,
      target: fallbackRoute,
      returnTo,
    });
    return fallbackRoute;
  }

  const scope = getProtectedScope(sanitizedReturnTo);
  if (scope === "user" && isAdminRole(role) && adminToUserPolicy === "allow") {
    return sanitizedReturnTo;
  }

  if (roleMatchesProtectedScope(role, scope)) {
    emitRedirectTelemetry({
      event: "auth.redirect.post-login",
      outcome: "return-to",
      reason: "valid-protected-path",
      role: role ?? undefined,
      target: sanitizedReturnTo,
      returnTo: sanitizedReturnTo,
    });
    return sanitizedReturnTo;
  }

  emitRedirectTelemetry({
    event: "auth.redirect.post-login",
    outcome: "fallback",
    reason: "role-mismatch",
    role: role ?? undefined,
    target: fallbackRoute,
    returnTo: sanitizedReturnTo,
  });

  return fallbackRoute;
}

// Backward-compatible aliases kept while existing call sites migrate.
export function sanitizeReturnTarget(
  rawReturnTarget: string | null | undefined,
  role: UserRoleValue | null | undefined
): string | null {
  const sanitizedReturnTo = sanitizeReturnTo(rawReturnTarget);
  if (!sanitizedReturnTo) return null;

  const scope = getProtectedScope(sanitizedReturnTo);
  return roleMatchesProtectedScope(role, scope) ? sanitizedReturnTo : null;
}
