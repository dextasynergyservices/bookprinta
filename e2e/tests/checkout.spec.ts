import { expect, type Page, type Route, test } from "@playwright/test";

/**
 * Path A, the way a new author goes through it: pricing → package →
 * configuration → add-ons and summary → online payment → return from the
 * provider → finish signup → verify email.
 *
 * Packages and add-ons are the local API's real (read-only) data, so the
 * expected prices are read from the API rather than assumed. Everything that
 * charges money or creates records is mocked: payment initialisation, the
 * provider redirect, verification and the signup calls.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const REFERENCE = "e2e_checkout_ref_001";
const SIGNUP_TOKEN = "e2e_signup_token_001";
const PAYER = {
  fullName: "Ada Okafor",
  email: "ada.e2e@example.com",
  phone: "+2348012345678",
};

type ApiPackage = { slug: string; name: string; basePrice: number; includesISBN: boolean };
type ApiAddon = {
  id: string;
  name: string;
  slug: string;
  pricingType: string;
  price: number | null;
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    return;
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

async function mockPaymentAndSignup(page: Page, baseUrl: string) {
  const captured: {
    initialize?: Record<string, unknown>;
    signupFinish?: Record<string, unknown>;
    verifyEmail?: Record<string, unknown>;
  } = {};

  await page.route("**/api/v1/payments/gateways*", (route) =>
    fulfillJson(route, [
      {
        id: "cmgatewaypaystack00000001",
        provider: "PAYSTACK",
        name: "Paystack",
        isEnabled: true,
        isTestMode: true,
        bankDetails: null,
        instructions: null,
        priority: 0,
      },
    ])
  );

  // Paystack would take the payer to its checkout and back to the callback
  // URL with the reference; the test goes straight to that return URL.
  await page.route("**/api/v1/payments/initialize", async (route) => {
    if (route.request().method() === "POST") {
      captured.initialize = route.request().postDataJSON();
    }
    await fulfillJson(route, {
      authorizationUrl: `${baseUrl}/payment/confirmation?provider=paystack&reference=${REFERENCE}&trxref=${REFERENCE}`,
      accessCode: "e2e_access_code",
      reference: REFERENCE,
      provider: "PAYSTACK",
    });
  });

  await page.route(`**/api/v1/payments/verify/${REFERENCE}*`, (route) =>
    fulfillJson(route, {
      status: "SUCCESS",
      reference: REFERENCE,
      amount: null,
      currency: "NGN",
      verified: true,
      awaitingWebhook: false,
      signupUrl: `/signup/finish?token=${SIGNUP_TOKEN}`,
      email: PAYER.email,
      orderNumber: "BP-2026-E2E1",
      signupDelivery: {
        status: "SENT",
        emailDelivered: true,
        whatsappDelivered: false,
        attemptCount: 1,
        lastAttemptAt: "2026-03-10T10:00:00.000Z",
        retryEligible: false,
      },
    })
  );

  await page.route("**/api/v1/auth/signup/context", (route) =>
    fulfillJson(route, {
      email: PAYER.email,
      firstName: "Ada",
      lastName: "Okafor",
      phoneNumber: PAYER.phone,
      nextStep: "password",
    })
  );

  await page.route("**/api/v1/auth/signup/finish", async (route) => {
    if (route.request().method() === "POST") {
      captured.signupFinish = route.request().postDataJSON();
    }
    await fulfillJson(route, { message: "Verification code sent." });
  });

  await page.route("**/api/v1/auth/verify-email", async (route) => {
    if (route.request().method() === "POST") {
      captured.verifyEmail = route.request().postDataJSON();
    }
    await fulfillJson(route, { message: "Email verified." });
  });

  return captured;
}

test.describe("Checkout (Path A)", () => {
  test("pricing to payment to finished signup", async ({ page, request, baseURL }) => {
    test.slow();
    const baseUrl = baseURL ?? "http://localhost:3000";

    const [packages, addons] = await Promise.all([
      request.get(`${API_URL}/api/v1/packages`).then((r) => r.json() as Promise<ApiPackage[]>),
      request.get(`${API_URL}/api/v1/addons`).then((r) => r.json() as Promise<ApiAddon[]>),
    ]);
    test.skip(packages.length === 0, "The local database has no active packages.");

    const captured = await mockPaymentAndSignup(page, baseUrl);

    // ── Pricing → package → configuration ──
    await page.goto("/pricing");
    await page.getByRole("button", { name: "Get Started" }).first().click();

    const configuration = page.getByRole("dialog");
    await expect(configuration).toBeVisible();
    const choose = async (group: string, option: string) =>
      configuration
        .getByRole("radiogroup", { name: group })
        .getByRole("radio", { name: option, exact: true })
        .click();
    await choose("Have cover design?", "Yes");
    await choose("Is it already formatted?", "Yes");
    await choose("Book Size", "A5");
    await choose("Paper Color", "White");
    await choose("Lamination", "Gloss");
    await configuration.getByRole("button", { name: "Continue" }).click();

    await page.waitForURL(/\/checkout\?package=/);
    const packageSlug = new URL(page.url()).searchParams.get("package");
    const selected = packages.find((pkg) => pkg.slug === packageSlug);
    expect(selected, `package "${packageSlug}" from the pricing page`).toBeTruthy();
    if (!selected) return;

    // ── Add-ons and summary ──
    const fixedAddon = addons.find(
      (addon) =>
        addon.pricingType === "fixed" &&
        typeof addon.price === "number" &&
        !(addon.slug.includes("isbn") && selected.includesISBN)
    );
    if (fixedAddon) {
      const card = page.getByRole("checkbox", { name: `${fixedAddon.name} addon` });
      await card.click();
      await expect(card).toHaveAttribute("aria-checked", "true");
    }
    const expectedTotal = selected.basePrice + (fixedAddon?.price ?? 0);

    await page.getByRole("button", { name: "Continue" }).first().click();

    // ── Online payment ──
    const payment = page.getByRole("dialog");
    await payment.getByRole("button", { name: /Pay Online/ }).click();
    await payment.getByRole("button", { name: /Paystack/ }).click();
    await payment.getByRole("textbox", { name: "Full Name" }).fill(PAYER.fullName);
    await payment.getByRole("textbox", { name: "Email Address" }).fill(PAYER.email);
    await payment.getByRole("textbox", { name: "Phone Number" }).fill(PAYER.phone);
    await payment.getByRole("button", { name: "Pay Now" }).click();

    // ── Back from the provider: verified, signup link offered ──
    await page.waitForURL(/\/payment\/confirmation\?.*signupUrl=/);
    expect(captured.initialize).toMatchObject({
      provider: "PAYSTACK",
      email: PAYER.email,
      amount: expectedTotal,
      currency: "NGN",
      metadata: {
        packageSlug: selected.slug,
        hasCover: true,
        hasFormatting: true,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        totalPrice: expectedTotal,
        fullName: PAYER.fullName,
        phone: PAYER.phone,
      },
    });
    await expect(page.getByText("BP-2026-E2E1")).toBeVisible();

    await page.getByRole("link", { name: "Complete Signup" }).click();

    // ── Finish signup: set a password, then verify the email ──
    await page.waitForURL(new RegExp(`/signup/finish\\?token=${SIGNUP_TOKEN}`));
    await page.getByLabel("Password", { exact: true }).fill("Bookprinta!2026");
    await page.getByLabel("Confirm Password", { exact: true }).fill("Bookprinta!2026");
    await page.getByRole("button", { name: "Set Password" }).click();

    await page.getByLabel("6-Digit Verification Code").fill("123456");
    await page.waitForURL(/\/signup\/finish\/confirmation/);
    await expect(page.getByRole("heading", { name: "Email Verified" })).toBeVisible();

    expect(captured.signupFinish).toMatchObject({
      token: SIGNUP_TOKEN,
      password: "Bookprinta!2026",
    });
    expect(captured.verifyEmail).toMatchObject({ code: "123456" });
  });
});
