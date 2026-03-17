import { expect, type Page, test } from "@playwright/test";

const QUOTE_ID = "cmquote_phase9_0001";
const TOKEN = "token_phase9_admin";

type RouteHandlerArg = Parameters<Parameters<Page["route"]>[1]>[0];

function corsHeaders(page: Page, requestUrl: string) {
  const requestOrigin = new URL(requestUrl).origin;
  const pageUrl = page.url();
  const pageOrigin = pageUrl && pageUrl !== "about:blank" ? new URL(pageUrl).origin : requestOrigin;

  return {
    "access-control-allow-origin": pageOrigin || requestOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    vary: "Origin",
  };
}

async function fulfillJson(page: Page, route: RouteHandlerArg, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(page, route.request().url()),
    body: JSON.stringify(body),
  });
}

async function fulfillPreflight(page: Page, route: RouteHandlerArg) {
  await route.fulfill({
    status: 204,
    headers: corsHeaders(page, route.request().url()),
  });
}

test.describe("Admin Quote Token Payment", () => {
  test("admin generates payment link and token payment redirects to signup finish", async ({
    page,
  }) => {
    let paymentLinkGenerated = false;

    await page.route("**/api/v1/auth/me*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      await fulfillJson(page, route, {
        user: {
          id: "cmadmin_phase9",
          email: "admin@bookprinta.com",
          role: "SUPER_ADMIN",
          firstName: "Admin",
          lastName: "User",
          displayName: "Admin User",
          isVerified: true,
        },
      });
    });

    await page.route("**/api/v1/users/me*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      await fulfillJson(page, route, {
        id: "cmadmin_phase9",
        email: "admin@bookprinta.com",
        firstName: "Admin",
        lastName: "User",
        role: "SUPER_ADMIN",
        isVerified: true,
      });
    });

    await page.route("**/api/v1/notifications/unread-count*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      await fulfillJson(page, route, {
        count: 0,
      });
    });

    await page.route("**/api/v1/auth/refresh*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      await fulfillJson(page, route, {
        accessToken: "refreshed_access_token",
      });
    });

    await page.route(`**/api/v1/admin/quotes/${QUOTE_ID}`, async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      await fulfillJson(page, route, {
        id: QUOTE_ID,
        status: paymentLinkGenerated ? "PAYMENT_LINK_SENT" : "PENDING",
        manuscript: {
          workingTitle: "Phase 9 Manuscript",
          estimatedWordCount: 25000,
        },
        print: {
          bookPrintSize: "A5",
          quantity: 100,
          coverType: "paperback",
        },
        specialRequirements: {
          hasSpecialReqs: false,
          specialReqs: [],
          specialReqsOther: null,
        },
        contact: {
          fullName: "Ada Writer",
          email: "ada@example.com",
          phone: "+2348012345678",
        },
        estimate: {
          mode: "RANGE",
          estimatedPriceLow: 170000,
          estimatedPriceHigh: 190000,
          label: "NGN 170,000 - NGN 190,000",
        },
        adminNotes: "",
        finalPrice: 180000,
        actions: {
          canReject: true,
          canArchive: true,
          canDelete: true,
          canRevokePaymentLink: true,
        },
        paymentLink: {
          token: paymentLinkGenerated ? TOKEN : null,
          url: paymentLinkGenerated ? `/pay/${TOKEN}` : null,
          expiresAt: paymentLinkGenerated ? "2026-03-24T09:00:00.000Z" : null,
          generatedAt: paymentLinkGenerated ? "2026-03-17T09:05:00.000Z" : null,
          displayStatus: paymentLinkGenerated ? "SENT" : "NOT_SENT",
          validityDays: 7,
        },
        createdAt: "2026-03-17T09:00:00.000Z",
        updatedAt: "2026-03-17T09:00:00.000Z",
      });
    });

    await page.route(`**/api/v1/admin/quotes/${QUOTE_ID}/payment-link`, async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      if (route.request().method() === "POST") {
        paymentLinkGenerated = true;
        await fulfillJson(page, route, {
          id: QUOTE_ID,
          status: "PAYMENT_LINK_SENT",
          paymentLink: {
            token: TOKEN,
            url: `/pay/${TOKEN}`,
            expiresAt: "2026-03-24T09:00:00.000Z",
            generatedAt: "2026-03-17T09:05:00.000Z",
            displayStatus: "SENT",
            validityDays: 7,
          },
          delivery: {
            attemptedAt: "2026-03-17T09:05:00.000Z",
            email: { attempted: true, delivered: true, failureReason: null },
            whatsapp: { attempted: true, delivered: true, failureReason: null },
          },
        });
        return;
      }

      await route.continue();
    });

    await page.route(`**/api/v1/pay/${TOKEN}*`, async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      if (route.request().method() === "GET") {
        await fulfillJson(page, route, {
          tokenStatus: "VALID",
          quote: {
            id: QUOTE_ID,
            workingTitle: "Phase 9 Manuscript",
            fullName: "Ada Writer",
            email: "ada@example.com",
            bookPrintSize: "A5",
            quantity: 100,
            finalPrice: 180000,
            status: "PAYMENT_LINK_SENT",
            paymentLinkExpiresAt: "2026-03-24T09:00:00.000Z",
          },
          message: null,
        });
        return;
      }

      if (route.request().method() === "POST") {
        await fulfillJson(page, route, {
          quoteId: QUOTE_ID,
          orderId: "cmorder_phase9_0001",
          status: "PENDING_PAYMENT",
          redirectTo: `/pay/${TOKEN}?provider=PAYSTACK&reference=phase9_ref_001`,
          skipFormatting: true,
        });
        return;
      }

      await route.continue();
    });

    await page.route("**/api/v1/payments/verify/phase9_ref_001*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      await fulfillJson(page, route, {
        status: "SUCCESS",
        reference: "phase9_ref_001",
        amount: 180000,
        currency: "NGN",
        verified: true,
        awaitingWebhook: false,
        signupUrl: `/signup/finish?token=signup_phase9_token`,
      });
    });

    await page.goto(`/admin/quotes/${QUOTE_ID}`);

    await expect(page.getByRole("heading", { name: "Phase 9 Manuscript" })).toBeVisible();
    await page.getByRole("button", { name: "Generate Payment Link" }).click();

    await expect(page.getByText(`/pay/${TOKEN}`)).toBeVisible();

    await page.goto(`/pay/${TOKEN}`);
    await expect(page.getByRole("heading", { name: "Complete your quote payment" })).toBeVisible();

    await page.getByRole("button", { name: "Pay with Paystack" }).click();
    await expect(page).toHaveURL(/\/signup\/finish/);
  });

  test("token payment page remains usable at 375/768/1280 without horizontal overflow", async ({
    page,
  }) => {
    await page.route(`**/api/v1/pay/${TOKEN}*`, async (route) => {
      if (route.request().method() === "OPTIONS") {
        await fulfillPreflight(page, route);
        return;
      }

      if (route.request().method() === "GET") {
        await fulfillJson(page, route, {
          tokenStatus: "VALID",
          quote: {
            id: QUOTE_ID,
            workingTitle: "Phase 9 Manuscript",
            fullName: "Ada Writer",
            email: "ada@example.com",
            bookPrintSize: "A5",
            quantity: 100,
            finalPrice: 180000,
            status: "PAYMENT_LINK_SENT",
            paymentLinkExpiresAt: "2026-03-24T09:00:00.000Z",
          },
          message: null,
        });
        return;
      }

      await route.continue();
    });

    const viewports = [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/pay/${TOKEN}`);

      await expect(
        page.getByRole("heading", { name: "Complete your quote payment" })
      ).toBeVisible();

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );
      expect(hasHorizontalOverflow).toBe(false);
    }
  });
});
