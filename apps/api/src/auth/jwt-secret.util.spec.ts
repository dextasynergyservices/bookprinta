/// <reference types="jest" />
/**
 * The signing secret must never silently fall back to a value that is public in
 * this repository.
 *
 * Four call sites previously did `process.env.JWT_SECRET || "fallback-dev-
 * secret-change-me"` with no validation anywhere. A deployment missing that one
 * variable would sign AND verify tokens with a committed string, letting anyone
 * mint a `role: SUPER_ADMIN` token. There is no symptom until it is exploited,
 * which is why this fails at startup instead.
 */
import { assertJwtSecretConfigured, resolveJwtSecret } from "./jwt-secret.util.js";

const VALID = "a-perfectly-reasonable-signing-secret-0123456789";

describe("resolveJwtSecret", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /** Sets the environment the way a deployed box would look. */
  function asDeployed(env: "production" | "staging" | "unknown") {
    delete process.env.VERCEL_ENV;
    delete process.env.RENDER_ENV;
    if (env === "unknown") {
      delete process.env.APP_ENV;
      delete process.env.NODE_ENV;
      return;
    }
    process.env.APP_ENV = env;
  }

  it("returns a configured secret", () => {
    process.env.JWT_SECRET = VALID;
    asDeployed("production");
    expect(resolveJwtSecret()).toBe(VALID);
  });

  it("trims surrounding whitespace", () => {
    process.env.JWT_SECRET = `  ${VALID}  `;
    asDeployed("production");
    expect(resolveJwtSecret()).toBe(VALID);
  });

  describe("refuses an untrustworthy secret in a deployed environment", () => {
    it.each(["production", "staging"] as const)("throws in %s when unset", (env) => {
      delete process.env.JWT_SECRET;
      asDeployed(env);
      expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is not set/);
    });

    it("throws when empty", () => {
      process.env.JWT_SECRET = "   ";
      asDeployed("production");
      expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is not set/);
    });

    it("throws when too short", () => {
      process.env.JWT_SECRET = "short";
      asDeployed("production");
      expect(() => resolveJwtSecret()).toThrow(/shorter than the 32-character minimum/);
    });

    it("rejects the old hardcoded fallback even if explicitly set", () => {
      // Someone copying the value out of git history must not get a pass.
      process.env.JWT_SECRET = "fallback-dev-secret-change-me";
      asDeployed("production");
      expect(() => resolveJwtSecret()).toThrow(/known placeholder value/);
    });

    it("treats an UNRESOLVED environment as deployed, not local", () => {
      // The important case: a box with no NODE_ENV/APP_ENV is a
      // misconfiguration, and the safe reading of a misconfiguration is
      // "assume this is real". Defaulting it to local is how a production
      // server ends up running with a public signing key.
      delete process.env.JWT_SECRET;
      asDeployed("unknown");
      expect(() => resolveJwtSecret()).toThrow(/Refusing to start in "unknown"/);
    });
  });

  describe("local development", () => {
    it.each([
      "development",
      "test",
    ] as const)("falls back to a clearly-named local secret in %s", (env) => {
      delete process.env.JWT_SECRET;
      delete process.env.VERCEL_ENV;
      delete process.env.RENDER_ENV;
      process.env.APP_ENV = env;

      const secret = resolveJwtSecret();
      expect(secret).toContain("local-development-only");
      // Must not be the legacy value, which may still exist in old configs.
      expect(secret).not.toBe("fallback-dev-secret-change-me");
    });
  });

  describe("assertJwtSecretConfigured", () => {
    it("passes when configured", () => {
      process.env.JWT_SECRET = VALID;
      asDeployed("production");
      expect(() => assertJwtSecretConfigured()).not.toThrow();
    });

    it("throws at boot so a bad config never reaches the first login", () => {
      delete process.env.JWT_SECRET;
      asDeployed("production");
      expect(() => assertJwtSecretConfigured()).toThrow();
    });
  });
});
