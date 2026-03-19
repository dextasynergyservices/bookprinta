import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { buildLoginRedirect, getProtectedScope } from "@/lib/auth/redirect-policy";
import { routing } from "@/lib/i18n/routing";

const intlMiddleware = createMiddleware(routing);
const ACCESS_TOKEN_COOKIE = "access_token";
const SESSION_MARKER_COOKIE = "bp_session";
const DEFAULT_LOCALE_OFFLINE_PATH = "/en/offline";
const OFFLINE_COMPATIBILITY_PATH = "/offline";

function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function isLikelyUnexpiredJwt(token: string | undefined): boolean {
  if (!token) return false;

  const segments = token.split(".");
  if (segments.length !== 3) return false;

  const payloadJson = decodeBase64Url(segments[1]);
  if (!payloadJson) return false;

  try {
    const payload = JSON.parse(payloadJson) as { exp?: unknown };
    if (typeof payload.exp !== "number") {
      return false;
    }

    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function resolveLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }

  return "";
}

function localizeLoginRedirect(loginRedirectHref: string, pathname: string): string {
  const localePrefix = resolveLocalePrefix(pathname);
  if (!localePrefix || !loginRedirectHref.startsWith("/login")) {
    return loginRedirectHref;
  }

  return `${localePrefix}${loginRedirectHref}`;
}

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === OFFLINE_COMPATIBILITY_PATH) {
    return NextResponse.rewrite(new URL(DEFAULT_LOCALE_OFFLINE_PATH, request.url));
  }

  if (pathname === DEFAULT_LOCALE_OFFLINE_PATH) {
    return NextResponse.next();
  }

  const currentPathWithQuery = `${pathname}${request.nextUrl.search}`;
  const isProtectedRoute = getProtectedScope(currentPathWithQuery) !== "none";
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const sessionMarker = request.cookies.get(SESSION_MARKER_COOKIE)?.value;
  // Check the real JWT cookie first (works when API shares root domain).
  // Fall back to the session marker cookie (set by frontend JS after login)
  // for cross-origin setups where the HttpOnly cookie lives on the API domain.
  const hasLikelyValidSession = isLikelyUnexpiredJwt(accessToken) || sessionMarker === "1";

  if (isProtectedRoute && !hasLikelyValidSession) {
    const loginRedirectHref = localizeLoginRedirect(
      buildLoginRedirect(currentPathWithQuery),
      pathname
    );
    return NextResponse.redirect(new URL(loginRedirectHref, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|sw\\.js|workbox-.*|.*\\..*).*)"],
};
