/// <reference types="jest" />
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { HealthStatusGuard } from "./health-status.guard.js";

function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe("HealthStatusGuard", () => {
  const original = process.env.HEALTH_STATUS_TOKEN;
  const guard = new HealthStatusGuard();

  afterEach(() => {
    if (original === undefined) delete process.env.HEALTH_STATUS_TOKEN;
    else process.env.HEALTH_STATUS_TOKEN = original;
  });

  it("disables the endpoint when no token is configured", () => {
    delete process.env.HEALTH_STATUS_TOKEN;
    expect(() => guard.canActivate(contextWith({ "x-health-token": "anything" }))).toThrow(
      ServiceUnavailableException
    );
  });

  describe("with a configured token", () => {
    beforeEach(() => {
      process.env.HEALTH_STATUS_TOKEN = "monitor-secret-token";
    });

    it("accepts a bearer token", () => {
      expect(guard.canActivate(contextWith({ authorization: "Bearer monitor-secret-token" }))).toBe(
        true
      );
    });

    it("accepts an X-Health-Token header", () => {
      expect(guard.canActivate(contextWith({ "x-health-token": "monitor-secret-token" }))).toBe(
        true
      );
    });

    it("rejects a missing token", () => {
      expect(() => guard.canActivate(contextWith({}))).toThrow(ForbiddenException);
    });

    it("rejects a same-length but different token", () => {
      expect(() =>
        guard.canActivate(contextWith({ "x-health-token": "monitor-secret-tokeN" }))
      ).toThrow(ForbiddenException);
    });
  });
});
