/**
 * Lightweight session marker cookie for cross-origin auth.
 *
 * Problem: The API (Render) sets HttpOnly `access_token` on its own domain.
 * proxy.ts on Vercel cannot read that cookie because it's a different origin.
 *
 * Solution: After login, the frontend sets a non-sensitive marker cookie
 * (`bp_session=1`) on the frontend domain. proxy.ts checks for this marker
 * to decide if the user likely has an active session. The actual auth
 * validation always happens server-side via the HttpOnly cookies sent
 * to the API with `credentials: "include"`.
 *
 * This cookie carries NO tokens or sensitive data — it's a boolean flag.
 */

export const SESSION_MARKER_COOKIE = "bp_session";
const SESSION_MARKER_VALUE = "1";

// 7 days — matches the longest refresh token TTL (regular users).
// If the refresh token expires, the client-side session query will detect
// the 401,clear the marker, and redirect to login.
const SESSION_MARKER_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Set the session marker cookie after successful login.
 * Must be called from client-side code (document.cookie).
 */
export function setSessionMarkerCookie(): void {
  if (typeof document === "undefined") return;

  const isSecure = window.location.protocol === "https:";
  const parts = [
    `${SESSION_MARKER_COOKIE}=${SESSION_MARKER_VALUE}`,
    "path=/",
    `max-age=${SESSION_MARKER_MAX_AGE_SECONDS}`,
    "samesite=lax",
  ];

  if (isSecure) {
    parts.push("secure");
  }

  document.cookie = parts.join("; ");
}

/**
 * Clear the session marker cookie on logout.
 * Must be called from client-side code (document.cookie).
 */
export function clearSessionMarkerCookie(): void {
  if (typeof document === "undefined") return;

  const isSecure = window.location.protocol === "https:";
  const parts = [`${SESSION_MARKER_COOKIE}=`, "path=/", "max-age=0", "samesite=lax"];

  if (isSecure) {
    parts.push("secure");
  }

  document.cookie = parts.join("; ");
}
