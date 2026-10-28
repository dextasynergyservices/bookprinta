import { isLocalEnvironment, resolveAppEnvironment } from "../common/app-environment.js";

/**
 * The secret that signs and verifies every access and refresh token, and keys
 * the refresh-token digest.
 *
 * ─── Why this file exists ──────────────────────────────────────────────────
 *
 * Four separate call sites previously did:
 *
 *   process.env.JWT_SECRET || "fallback-dev-secret-change-me"
 *
 * — the signing path, both Passport strategies, and the refresh-token digest.
 * Nothing validated the variable at boot. So if `JWT_SECRET` were ever unset or
 * empty in a deployed environment, tokens would be signed AND verified with a
 * string that is committed to this repository. Anyone could mint a JWT with
 * `role: SUPER_ADMIN` and take over the system, with no symptom until it
 * happened.
 *
 * That is a total compromise gated on nothing but an env var being present, so
 * it must fail at startup instead of silently working.
 *
 * The same pattern already existed in CloudinaryProvider, which refuses to boot
 * in production without credentials. This applies it to the most
 * security-critical value in the application.
 */

/** The old hardcoded fallback. Rejected explicitly in case it is ever set. */
const LEGACY_INSECURE_FALLBACK = "fallback-dev-secret-change-me";

/**
 * Used ONLY when the environment is positively identified as development or
 * test. Named so that it is obvious in a stack trace or token dump.
 */
const LOCAL_DEVELOPMENT_SECRET = "local-development-only-jwt-secret-not-for-deployment";

/**
 * Minimum length for a real secret. `openssl rand -hex 32` gives 64 chars; 32
 * is a floor that rejects obviously hand-typed values without being
 * obstructive.
 */
const MIN_SECRET_LENGTH = 32;

function describeProblem(secret: string | undefined): string | null {
  if (!secret || secret.trim().length === 0) {
    return "JWT_SECRET is not set";
  }
  if (secret === LEGACY_INSECURE_FALLBACK || secret === LOCAL_DEVELOPMENT_SECRET) {
    return "JWT_SECRET is set to a known placeholder value from the source tree";
  }
  if (secret.trim().length < MIN_SECRET_LENGTH) {
    return `JWT_SECRET is shorter than the ${MIN_SECRET_LENGTH}-character minimum`;
  }
  return null;
}

/**
 * Returns the signing secret, or throws when it cannot be trusted.
 *
 * Note `"unknown"` environments are treated as deployed, not local — see
 * resolveAppEnvironment. A box with no NODE_ENV/APP_ENV is a misconfiguration,
 * and the safe reading of a misconfiguration is "assume this is real".
 */
export function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET;
  const problem = describeProblem(configured);

  if (!problem) {
    return (configured as string).trim();
  }

  const environment = resolveAppEnvironment();
  if (isLocalEnvironment(environment)) {
    return LOCAL_DEVELOPMENT_SECRET;
  }

  throw new Error(
    `${problem}. Refusing to start in "${environment}": tokens would be signed with a ` +
      "value that is public in the source tree, allowing anyone to forge an admin session. " +
      "Generate one with `openssl rand -hex 32` and set JWT_SECRET on the service."
  );
}

/**
 * Boot-time gate. Call before the Nest application is created so a bad config
 * fails immediately and loudly, rather than at the first login attempt.
 */
export function assertJwtSecretConfigured(): void {
  resolveJwtSecret();
}
