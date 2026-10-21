/**
 * Which deployment we are running as.
 *
 * Extracted from RolloutService so security-critical code (JWT secret
 * validation) can resolve the environment without taking a DI dependency on a
 * feature-flag service, and so there is exactly one place that decides what
 * counts as "production".
 */
export type AppEnvironment = "development" | "test" | "staging" | "production" | "unknown";

/**
 * Resolve the environment from the first env var that is set.
 *
 * `"unknown"` means no recognised value was found. Callers must treat that as
 * UNTRUSTED and fail closed: an unset environment is far more likely to be a
 * misconfigured deployment than a deliberate choice, and defaulting it to
 * "probably not production" is how a production box ends up running with
 * development defaults.
 *
 * All three of our contexts set one of these explicitly — `APP_ENV=development`
 * in `.env`, `NODE_ENV=test` from Jest, `NODE_ENV=production` in the
 * Dockerfile — so `"unknown"` should never occur in normal operation.
 */
export function resolveAppEnvironment(): AppEnvironment {
  const rawValue =
    process.env.APP_ENV ??
    process.env.VERCEL_ENV ??
    process.env.RENDER_ENV ??
    process.env.NODE_ENV ??
    "";
  const normalized = rawValue.trim().toLowerCase();

  if (normalized === "production" || normalized === "prod") return "production";
  if (normalized === "staging" || normalized === "stage" || normalized === "preview") {
    return "staging";
  }
  if (normalized === "test") return "test";
  if (normalized === "development" || normalized === "dev" || normalized === "local") {
    return "development";
  }

  return "unknown";
}

/**
 * True only for environments we have positively identified as local.
 *
 * Deliberately NOT `environment !== "production"`. That phrasing treats an
 * unresolved environment as non-production and hands it development defaults —
 * the fail-open direction. Requiring an explicit match means a deployment with
 * missing env vars gets production-grade strictness instead.
 */
export function isLocalEnvironment(environment: AppEnvironment): boolean {
  return environment === "development" || environment === "test";
}
