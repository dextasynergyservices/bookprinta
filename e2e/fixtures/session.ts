import type { Page } from "@playwright/test";

export type SessionRole = "USER" | "ADMIN" | "SUPER_ADMIN";

/** An unsigned JWT: proxy.ts only reads `exp`, and the API itself is mocked. */
export function createMockAccessToken(role: SessionRole, expMsFromNow = 60 * 60_000): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: role === "USER" ? "user-1" : "admin-1",
    role,
    exp: Math.floor((Date.now() + expMsFromNow) / 1000),
  });
  return `${header}.${payload}.mock-signature`;
}

const CORS_HEADERS = {
  "access-control-allow-origin": process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

/**
 * A signed-in browser: the API's `access_token`, the `bp_session` marker the
 * API sets with every token, and `/auth/me` answering for `role`. proxy.ts
 * accepts either cookie, but the client only asks `/auth/me` when the marker is
 * present, and the real API would reject the mock token. A spec that needs a
 * different user can route `/auth/me` again; the later route wins.
 */
export async function seedSession(page: Page, role: SessionRole = "USER"): Promise<void> {
  const webUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const token = createMockAccessToken(role);

  await page.context().addCookies([
    { name: "access_token", value: token, url: webUrl, httpOnly: true, sameSite: "Lax" },
    { name: "access_token", value: token, url: apiUrl, httpOnly: true, sameSite: "Lax" },
    { name: "bp_session", value: "1", url: webUrl, sameSite: "Lax" },
  ]);

  const user = {
    id: role === "USER" ? "user-1" : "admin-1",
    email: role === "USER" ? "author@example.com" : "admin@example.com",
    firstName: role === "USER" ? "Author" : "Admin",
    lastName: "Test",
    role,
  };
  await page.route("**/api/v1/auth/me*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    await route.fulfill({ status: 200, headers: CORS_HEADERS, json: { user } });
  });
  await page.route("**/api/v1/auth/refresh*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    await route.fulfill({ status: 200, headers: CORS_HEADERS, json: {} });
  });
}
