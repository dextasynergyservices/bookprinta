/// <reference types="jest" />
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { CronTokenGuard } from "./cron-token.guard.js";

function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe("CronTokenGuard", () => {
  const original = process.env.CRON_TRIGGER_TOKEN;
  const guard = new CronTokenGuard();

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_TRIGGER_TOKEN;
    else process.env.CRON_TRIGGER_TOKEN = original;
  });

  it("disables the endpoints entirely when no token is configured", () => {
    delete process.env.CRON_TRIGGER_TOKEN;

    // Deploying without configuring the secret must expose nothing, even to a
    // caller who happens to send a token.
    expect(() => guard.canActivate(contextWith({}))).toThrow(ServiceUnavailableException);
    expect(() => guard.canActivate(contextWith({ authorization: "Bearer anything" }))).toThrow(
      ServiceUnavailableException
    );
  });

  describe("with a configured token", () => {
    beforeEach(() => {
      process.env.CRON_TRIGGER_TOKEN = "s3cret-cron-token";
    });

    it("accepts an Authorization bearer token", () => {
      expect(guard.canActivate(contextWith({ authorization: "Bearer s3cret-cron-token" }))).toBe(
        true
      );
    });

    it("accepts an X-Cron-Token header, for providers that cannot set Authorization", () => {
      expect(guard.canActivate(contextWith({ "x-cron-token": "s3cret-cron-token" }))).toBe(true);
    });

    it("rejects a missing token", () => {
      expect(() => guard.canActivate(contextWith({}))).toThrow(ForbiddenException);
    });

    it("rejects a wrong token", () => {
      expect(() => guard.canActivate(contextWith({ "x-cron-token": "nope" }))).toThrow(
        ForbiddenException
      );
    });

    it("rejects a same-length but different token", () => {
      // Guards against a length-only comparison.
      expect(() => guard.canActivate(contextWith({ "x-cron-token": "S3CRET-cron-tokeN" }))).toThrow(
        ForbiddenException
      );
    });

    it("rejects a malformed Authorization header", () => {
      expect(() => guard.canActivate(contextWith({ authorization: "s3cret-cron-token" }))).toThrow(
        ForbiddenException
      );
    });
  });
});
