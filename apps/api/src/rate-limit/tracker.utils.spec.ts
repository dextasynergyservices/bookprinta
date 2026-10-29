/// <reference types="jest" />
import { Controller, Get, Module, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { resolveJwtSecret } from "../auth/jwt-secret.util.js";
import {
  extractAuthenticatedUserId,
  getIpTracker,
  getLoginIdentifierTracker,
  getNormalizedEmailTracker,
  resolveRequestTracker,
  resolveTrustProxySetting,
} from "./tracker.utils.js";

describe("rate-limit tracker utils", () => {
  it("normalizes email tracker to lowercase and trim", () => {
    const tracker = getNormalizedEmailTracker(
      { body: { email: "  User@Example.COM  " }, ip: "10.0.0.8" },
      {} as never
    );
    expect(tracker).toBe("email:user@example.com");
  });

  it("falls back to the proxy-resolved IP when email is missing", () => {
    const tracker = getNormalizedEmailTracker({ body: {}, ip: "203.0.113.10" }, {} as never);
    expect(tracker).toBe("ip:203.0.113.10");
  });

  it("never reads X-Forwarded-For directly — only Express's resolved req.ip", () => {
    const tracker = getIpTracker(
      { headers: { "x-forwarded-for": "1.2.3.4" }, ip: "198.51.100.25" },
      {} as never
    );
    expect(tracker).toBe("ip:198.51.100.25");
  });

  describe("login identifier tracker", () => {
    it("keys by normalised email", () => {
      expect(
        getLoginIdentifierTracker({ body: { identifier: " Ada@Example.com " } }, {} as never)
      ).toBe("login:ada@example.com");
    });

    it("collapses phone formatting variants to one account bucket", () => {
      const a = getLoginIdentifierTracker(
        { body: { identifier: "+234 803 123 4567" } },
        {} as never
      );
      const b = getLoginIdentifierTracker({ body: { identifier: "08031234567" } }, {} as never);
      expect(a).toBe(b);
    });

    it("falls back to IP without an identifier", () => {
      expect(getLoginIdentifierTracker({ body: {}, ip: "5.5.5.5" }, {} as never)).toBe(
        "ip:5.5.5.5"
      );
    });
  });

  describe("authenticated tracker", () => {
    const secret = resolveJwtSecret();

    it("keys a request with a valid access token by user id", () => {
      const token = jwt.sign({ sub: "user_42", email: "a@b.co" }, secret, { expiresIn: 60 });
      expect(resolveRequestTracker({ cookies: { access_token: token }, ip: "1.1.1.1" })).toBe(
        "user:user_42"
      );
    });

    it("accepts a bearer token", () => {
      const token = jwt.sign({ sub: "user_7" }, secret, { expiresIn: 60 });
      expect(extractAuthenticatedUserId({ headers: { authorization: `Bearer ${token}` } })).toBe(
        "user_7"
      );
    });

    it.each([
      ["forged", () => jwt.sign({ sub: "user_victim" }, "not-our-secret", { expiresIn: 60 })],
      [
        "expired",
        () => jwt.sign({ sub: "user_42", exp: Math.floor(Date.now() / 1000) - 10 }, secret),
      ],
      ["garbage", () => "not.a.jwt"],
    ])("falls back to the IP bucket for a %s token", (_label, makeToken) => {
      expect(resolveRequestTracker({ cookies: { access_token: makeToken() }, ip: "9.9.9.9" })).toBe(
        "ip:9.9.9.9"
      );
    });
  });

  describe("trust proxy", () => {
    it("defaults to 2 hops (Vercel → Render) in production and off elsewhere", () => {
      expect(resolveTrustProxySetting({ NODE_ENV: "production" } as never)).toBe(2);
      expect(resolveTrustProxySetting({ NODE_ENV: "development" } as never)).toBe(false);
    });

    it("honours TRUST_PROXY_HOPS", () => {
      expect(resolveTrustProxySetting({ TRUST_PROXY_HOPS: "3" } as never)).toBe(3);
      expect(resolveTrustProxySetting({ TRUST_PROXY_HOPS: "0" } as never)).toBe(false);
      expect(
        resolveTrustProxySetting({ NODE_ENV: "production", TRUST_PROXY_HOPS: "x" } as never)
      ).toBe(2);
    });

    // Real Express behaviour: Vercel sets XFF to the client, Render appends
    // Vercel's address, the socket is Render's internal proxy.
    @Controller()
    class IpController {
      @Get()
      ip(@Req() req: { ip?: string }) {
        return { ip: req.ip };
      }
    }

    @Module({ controllers: [IpController] })
    class IpModule {}

    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await NestFactory.create<NestExpressApplication>(IpModule, { logger: false });
      app.set("trust proxy", 2);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    const appWithHops = (_hops: number) => app.getHttpServer();

    it("resolves the real client through the Vercel → Render chain", async () => {
      const res = await request(appWithHops(2))
        .get("/")
        .set("X-Forwarded-For", "203.0.113.50, 76.76.21.9");
      expect(res.body.ip).toBe("203.0.113.50");
    });

    it("does not let a client displace the hops our proxies append", async () => {
      // Attacker prepends a fake address; Vercel overwrites/appends the real one.
      const res = await request(appWithHops(2))
        .get("/")
        .set("X-Forwarded-For", "6.6.6.6, 203.0.113.50, 76.76.21.9");
      expect(res.body.ip).toBe("203.0.113.50");
    });
  });
});
