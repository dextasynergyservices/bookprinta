import { expect, test } from "@playwright/test";

type UserRole = "USER" | "ADMIN";

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createJwtWithRole(role: UserRole, expMsFromNow = 5 * 60_000): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: role === "ADMIN" ? "admin-1" : "user-1",
      role,
      exp: Math.floor((Date.now() + expMsFromNow) / 1000),
    })
  );

  return `${header}.${payload}.signature`;
}

async function setAccessTokenCookie(page: Parameters<typeof test>[0]["page"], role: UserRole) {
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookieValue = createJwtWithRole(role);

  await page.context().addCookies([
    {
      name: "access_token",
      value: cookieValue,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "access_token",
      value: cookieValue,
      url: apiBaseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockAuthSession(page: Parameters<typeof test>[0]["page"], role: UserRole) {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: role === "ADMIN" ? "admin-1" : "user-1",
          email: role === "ADMIN" ? "admin@example.com" : "author@example.com",
          role,
          firstName: role === "ADMIN" ? "Admin" : "Author",
          lastName: "Test",
          displayName: role === "ADMIN" ? "Admin Test" : "Author Test",
          initials: role === "ADMIN" ? "AT" : "UT",
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

test.describe("Authentication redirects", () => {
  test("redirects unauthenticated FR user deep-link to localized login with exact returnTo", async ({
    page,
  }) => {
    await page.goto("/fr/dashboard/orders/123?tab=tracking", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(
      /\/fr\/login\?returnTo=%2Ffr%2Fdashboard%2Forders%2F123%3Ftab%3Dtracking/
    );
  });

  test("redirects unauthenticated ES admin deep-link to localized login with exact returnTo", async ({
    page,
  }) => {
    await page.goto("/es/admin/quotes?status=PENDING", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/es\/login\?returnTo=%2Fes%2Fadmin%2Fquotes%3Fstatus%3DPENDING/);
  });

  test("returns authenticated USER in FR locale to exact deep-link target", async ({ page }) => {
    await setAccessTokenCookie(page, "USER");
    await mockAuthSession(page, "USER");

    await page.goto("/fr/login?returnTo=%2Fdashboard%2Forders%2F123%3Ftab%3Dtracking", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/fr\/dashboard\/orders\/123\?tab=tracking$/, {
      timeout: 15_000,
    });
  });

  test("returns authenticated ADMIN in ES locale to exact admin deep-link target", async ({
    page,
  }) => {
    await setAccessTokenCookie(page, "ADMIN");
    await mockAuthSession(page, "ADMIN");

    await page.goto("/es/login?returnTo=%2Fadmin%2Fquotes%3Fstatus%3DPENDING", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/es\/admin\/quotes\?status=PENDING$/, {
      timeout: 15_000,
    });
  });

  test("falls back to admin home on role mismatch returnTo", async ({ page }) => {
    await setAccessTokenCookie(page, "ADMIN");
    await mockAuthSession(page, "ADMIN");

    await page.goto("/es/login?returnTo=%2Fdashboard%2Forders%2F123", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/es\/admin\/?$/, {
      timeout: 15_000,
    });
  });

  test("blocks invalid returnTo and falls back to user home", async ({ page }) => {
    await setAccessTokenCookie(page, "USER");
    await mockAuthSession(page, "USER");

    await page.goto("/fr/login?returnTo=https%3A%2F%2Fevil.example%2Fhijack", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/fr\/dashboard\/?$/, {
      timeout: 15_000,
    });
  });
});
