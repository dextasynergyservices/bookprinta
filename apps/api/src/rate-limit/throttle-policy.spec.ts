/// <reference types="jest" />
import { AuthController } from "../auth/auth.controller.js";
import { CouponsController } from "../coupons/coupons.controller.js";
import { PaymentsController } from "../payments/payments.controller.js";
import { getIpTracker, getNormalizedEmailTracker } from "./tracker.utils.js";

const LIMIT_META_PREFIX = "THROTTLER:LIMIT";
const TTL_META_PREFIX = "THROTTLER:TTL";
const TRACKER_META_PREFIX = "THROTTLER:TRACKER";

type MethodTarget = (...args: unknown[]) => unknown;

function methodOf<T extends object>(
  klass: new (...args: never[]) => T,
  key: keyof T
): MethodTarget {
  return (klass as unknown as { prototype: Record<string, MethodTarget> }).prototype[String(key)];
}

function getLimit(target: MethodTarget, bucket: "short" | "long") {
  return Reflect.getMetadata(`${LIMIT_META_PREFIX}${bucket}`, target) as number | undefined;
}

function getTtl(target: MethodTarget, bucket: "short" | "long") {
  return Reflect.getMetadata(`${TTL_META_PREFIX}${bucket}`, target) as number | undefined;
}

function getTracker(target: MethodTarget, bucket: "short" | "long") {
  return Reflect.getMetadata(`${TRACKER_META_PREFIX}${bucket}`, target) as
    | ((...args: unknown[]) => unknown)
    | undefined;
}

describe("throttle policy metadata", () => {
  it("applies 10 req/min to payment initialize endpoint", () => {
    const target = methodOf(PaymentsController, "initialize");

    expect(getLimit(target, "short")).toBe(10);
    expect(getTtl(target, "short")).toBe(60_000);
    expect(getLimit(target, "long")).toBe(10);
    expect(getTtl(target, "long")).toBe(60_000);
  });

  it("applies 10 req/min to bank-transfer submission endpoint", () => {
    const target = methodOf(PaymentsController, "submitBankTransfer");

    expect(getLimit(target, "short")).toBe(10);
    expect(getTtl(target, "short")).toBe(60_000);
    expect(getLimit(target, "long")).toBe(10);
    expect(getTtl(target, "long")).toBe(60_000);
  });

  it("applies 3/hour resend limit keyed by normalized email", () => {
    const target = methodOf(AuthController, "resendSignupLink");

    expect(getLimit(target, "short")).toBe(3);
    expect(getTtl(target, "short")).toBe(3_600_000);
    expect(getTracker(target, "short")).toBe(getNormalizedEmailTracker);
    expect(getLimit(target, "long")).toBe(3);
    expect(getTtl(target, "long")).toBe(3_600_000);
    expect(getTracker(target, "long")).toBe(getNormalizedEmailTracker);
  });

  it("applies 3/hour coupon validation limit keyed by IP", () => {
    const target = methodOf(CouponsController, "validate");

    expect(getLimit(target, "short")).toBe(3);
    expect(getTtl(target, "short")).toBe(3_600_000);
    expect(getTracker(target, "short")).toBe(getIpTracker);
    expect(getLimit(target, "long")).toBe(3);
    expect(getTtl(target, "long")).toBe(3_600_000);
    expect(getTracker(target, "long")).toBe(getIpTracker);
  });
});
