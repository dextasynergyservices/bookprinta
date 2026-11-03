import { expect, type Page, test } from "@playwright/test";

/**
 * Real Paystack, test mode. Nothing is mocked: the local API initialises a real
 * Paystack transaction, the browser completes it on checkout.paystack.com with
 * Paystack's test options, and the order is created by our own verify call.
 *
 * Opt-in only, because it calls Paystack and creates real orders and users in
 * the local database:
 *
 *   PAYSTACK_LIVE_E2E=1 bun x playwright test checkout-paystack.live --project=chromium
 *
 * Needs the API running with a Paystack TEST secret key (sk_test_…) and
 * FRONTEND_URL pointing at the web app under test. Every run uses a fresh
 * email and phone number, since both must be unique per account.
 */

test.skip(!process.env.PAYSTACK_LIVE_E2E, "Set PAYSTACK_LIVE_E2E=1 to run against real Paystack.");
test.describe.configure({ mode: "default" });

function uniquePayer() {
  const stamp = `${Date.now()}`;
  return {
    fullName: "Ada Livetest",
    email: `ada.live.${stamp}@example.com`,
    phone: `+23480${stamp.slice(-8)}`,
  };
}

/** Pricing → configuration → checkout → Pay Online → Paystack's hosted page. */
async function goToPaystack(page: Page) {
  const payer = uniquePayer();

  await page.goto("/pricing");
  await page.getByRole("button", { name: "Get Started" }).first().click();

  const configuration = page.getByRole("dialog");
  for (const [group, option] of [
    ["Have cover design?", "Yes"],
    ["Is it already formatted?", "Yes"],
    ["Book Size", "A5"],
    ["Paper Color", "White"],
    ["Lamination", "Gloss"],
  ]) {
    await configuration
      .getByRole("radiogroup", { name: group })
      .getByRole("radio", { name: option, exact: true })
      .click();
  }
  await configuration.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/checkout\?package=/);
  const checkoutUrl = page.url();

  await page.getByRole("button", { name: "Continue" }).first().click();
  const payment = page.getByRole("dialog");
  await payment.getByRole("button", { name: /Pay Online/ }).click();
  await payment.getByRole("button", { name: /Paystack/ }).click();
  await payment.getByRole("textbox", { name: "Full Name" }).fill(payer.fullName);
  await payment.getByRole("textbox", { name: "Email Address" }).fill(payer.email);
  await payment.getByRole("textbox", { name: "Phone Number" }).fill(payer.phone);
  await payment.getByRole("button", { name: "Pay Now" }).click();

  await page.waitForURL(/checkout\.paystack\.com/, { timeout: 60_000 });
  // Paystack test mode offers canned outcomes instead of a card form.
  await expect(page.getByText("Success", { exact: true })).toBeVisible({ timeout: 30_000 });
  return { payer, checkoutUrl };
}

async function payWithTestCard(page: Page, outcome: "Success" | "Declined") {
  await page.getByText(outcome, { exact: true }).click();
  await page.getByRole("button", { name: /^Pay NGN/ }).click();
}

async function expectConfirmedOrder(page: Page, email: string) {
  await expect(page.getByRole("heading", { name: "Payment Confirmed!" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/^BP-\d{4}-[A-Z0-9]+$/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`email=${encodeURIComponent(email)}`));
}

test.describe("Checkout with real Paystack (test mode)", () => {
  test.beforeEach(() => {
    test.setTimeout(180_000);
  });

  test("a successful payment creates the order and opens the signup", async ({ page }) => {
    const { payer } = await goToPaystack(page);
    await payWithTestCard(page, "Success");

    await page.waitForURL(/\/payment\/confirmation\?/, { timeout: 90_000 });
    await expectConfirmedOrder(page, payer.email);

    // The signup link is real: the API resolves it to this payer's details.
    await page.getByRole("link", { name: "Complete Signup" }).click();
    await page.waitForURL(/\/signup\/finish\?token=/);
    await expect(page.getByRole("heading", { name: "Complete Your Account Setup" })).toBeVisible();
    await expect(page.getByLabel("Email Address")).toHaveValue(payer.email);
    await expect(page.getByLabel("Phone Number")).toHaveValue(payer.phone);
  });

  test("a declined card stays on Paystack and creates nothing", async ({ page }) => {
    await goToPaystack(page);
    await payWithTestCard(page, "Declined");

    await expect(page.getByText("Declined", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Retry/ })).toBeVisible();
    expect(page.url()).toContain("checkout.paystack.com");
  });

  test("cancelling on Paystack returns to the same checkout, choices intact", async ({ page }) => {
    const { checkoutUrl } = await goToPaystack(page);

    await page.getByRole("button", { name: "Close" }).click();
    const confirmCancel = page.getByRole("button", { name: /yes|cancel/i }).first();
    if (await confirmCancel.isVisible().catch(() => false)) await confirmCancel.click();

    await page.waitForURL((url) => url.href.startsWith(checkoutUrl.split("&")[0]), {
      timeout: 60_000,
    });
    await expect(page.getByText("Please complete your package configuration first.")).toHaveCount(
      0
    );
    await expect(page.getByRole("button", { name: "Continue" }).first()).toBeEnabled({
      timeout: 30_000,
    });
  });

  test("a payer who never comes back is recovered on their next visit", async ({ page }) => {
    const { payer } = await goToPaystack(page);

    // Simulate closing the tab after paying: Paystack's redirect back to us
    // never reaches the confirmation page.
    await page.route("**/payment/confirmation?**", (route) =>
      route.request().resourceType() === "document"
        ? route.fulfill({ contentType: "text/html", body: "<p>tab closed</p>" })
        : route.continue()
    );
    await payWithTestCard(page, "Success");
    await expect(page.getByText("tab closed")).toBeVisible({ timeout: 90_000 });
    await page.unroute("**/payment/confirmation?**");

    // Next visit, anywhere on the site.
    await page.goto("/");
    const recovered = page.getByText("We found your payment");
    await expect(recovered).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "View confirmation" }).click();

    await expectConfirmedOrder(page, payer.email);
  });
});
