/// <reference types="jest" />
import { getIpTracker, getNormalizedEmailTracker } from "./tracker.utils.js";

describe("rate-limit tracker utils", () => {
  it("normalizes email tracker to lowercase and trim", () => {
    const tracker = getNormalizedEmailTracker(
      {
        body: { email: "  User@Example.COM  " },
        ip: "10.0.0.8",
      },
      {} as never
    );

    expect(tracker).toBe("email:user@example.com");
  });

  it("falls back to IP tracker when email is missing", () => {
    const tracker = getNormalizedEmailTracker(
      {
        body: {},
        headers: { "x-forwarded-for": "203.0.113.10, 70.0.0.1" },
        ip: "10.0.0.8",
      },
      {} as never
    );

    expect(tracker).toBe("ip:203.0.113.10");
  });

  it("uses forwarded IP when available", () => {
    const tracker = getIpTracker(
      {
        headers: { "x-forwarded-for": "198.51.100.25, 10.0.0.1" },
        ip: "127.0.0.1",
      },
      {} as never
    );

    expect(tracker).toBe("198.51.100.25");
  });

  it("returns request ip when forwarded header is absent", () => {
    const tracker = getIpTracker(
      {
        ip: "192.168.1.4",
      },
      {} as never
    );

    expect(tracker).toBe("192.168.1.4");
  });
});
