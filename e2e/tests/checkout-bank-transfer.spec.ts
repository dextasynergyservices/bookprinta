import { expect, type Page, type Route, test } from "@playwright/test";
import { seedSession } from "../fixtures/session";

/**
 * Path A by bank transfer, both halves:
 *  1. the author picks a package, sees the account details, sends a receipt
 *     and lands on the "being verified" page;
 *  2. an admin approves the transfer from the pending queue.
 *
 * Packages and add-ons are the local API's real (read-only) data. The
 * submission and the admin queue are mocked, because the real ones upload the
 * receipt to Cloudinary, scan it and alert admins by WhatsApp and email.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const PAYER = {
  fullName: "Chidi Bankpayer",
  email: "chidi.transfer@example.com",
  phone: "+2348098765432",
};
const BANK_ACCOUNT = {
  bank: "Test Bank Plc",
  accountName: "BookPrinta Test Account",
  accountNumber: "0123456789",
};

type ApiPackage = { slug: string; name: string; basePrice: number };

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

async function mockBankGateway(page: Page) {
  await page.route("**/api/v1/payments/gateways*", (route) =>
    fulfillJson(route, [
      {
        id: "cmgatewaybanktransfer0001",
        provider: "BANK_TRANSFER",
        name: "Bank Transfer",
        isEnabled: true,
        isTestMode: false,
        bankDetails: { accounts: [BANK_ACCOUNT] },
        instructions: "Use your full name as the transfer narration.",
        priority: 1,
      },
    ])
  );
}

function pendingTransfer(amount: number) {
  return {
    id: "cmpaybanktransfer00000001",
    orderReference: "BP-2026-BANK1",
    orderNumber: null,
    orderId: null,
    userId: null,
    customer: {
      id: null,
      fullName: PAYER.fullName,
      email: PAYER.email,
      phoneNumber: PAYER.phone,
      preferredLanguage: "en",
    },
    provider: "BANK_TRANSFER",
    type: "INITIAL",
    status: "AWAITING_APPROVAL",
    amount,
    currency: "NGN",
    providerRef: "bt_e2e_0001",
    receiptUrl: "https://res.cloudinary.com/demo/image/upload/receipt.png",
    payerName: PAYER.fullName,
    payerEmail: PAYER.email,
    payerPhone: PAYER.phone,
    adminNote: null,
    hasAdminNote: false,
    approvedAt: null,
    approvedBy: null,
    processedAt: null,
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    pendingCheckout: null,
    refundability: {
      isRefundable: false,
      processingMode: "manual",
      reason: "Pending approval",
      policySnapshot: null,
      orderVersion: null,
      bookVersion: null,
    },
    slaSnapshot: { ageMinutes: 12, state: "green" },
    signupLinkDelivery: null,
  };
}

test.describe("Checkout by bank transfer", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("the author sends a receipt and sees it is being verified", async ({ page, request }) => {
    test.slow();
    const packages = (await request
      .get(`${API_URL}/api/v1/packages`)
      .then((response) => response.json())) as ApiPackage[];
    test.skip(packages.length === 0, "The local database has no active packages.");

    await mockBankGateway(page);
    let submission: { contentType: string; body: string } | null = null;
    await page.route("**/api/v1/payments/bank-transfer", async (route) => {
      submission = {
        contentType: route.request().headers()["content-type"] ?? "",
        body: route.request().postDataBuffer()?.toString("latin1") ?? "",
      };
      await fulfillJson(route, {
        id: "cmpaybanktransfer00000001",
        status: "AWAITING_APPROVAL",
        message: "Receipt received. We will verify your payment shortly.",
      });
    });

    // ── Pricing → configuration → checkout ──
    await page.goto("/pricing");
    await page.getByRole("button", { name: "Get Started" }).first().click();
    const configuration = page.getByRole("dialog");
    for (const [group, option] of [
      ["Have cover design?", "Yes"],
      ["Is it already formatted?", "Yes"],
      ["Book Size", "A5"],
      ["Paper Color", "Cream"],
      ["Lamination", "Matt"],
    ]) {
      await configuration
        .getByRole("radiogroup", { name: group })
        .getByRole("radio", { name: option, exact: true })
        .click();
    }
    await configuration.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/checkout\?package=/);
    const packageSlug = new URL(page.url()).searchParams.get("package");
    const selected = packages.find((pkg) => pkg.slug === packageSlug);
    expect(selected, `package "${packageSlug}" from the pricing page`).toBeTruthy();
    if (!selected) return;

    await page.getByRole("button", { name: "Continue" }).first().click();

    // ── Bank details ──
    const payment = page.getByRole("dialog");
    await payment.getByRole("button", { name: /Bank Transfer/ }).click();
    await expect(payment.getByText(BANK_ACCOUNT.accountNumber)).toBeVisible();
    await expect(payment.getByText(BANK_ACCOUNT.bank)).toBeVisible();
    await expect(payment.getByText("Use your full name as the transfer narration.")).toBeVisible();

    await payment.getByRole("button", { name: "Copy Account Number" }).click();
    await expect(page.getByText("Copied").first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      BANK_ACCOUNT.accountNumber
    );

    // ── Receipt ──
    await payment.getByRole("button", { name: "Payment Done" }).click();
    await payment.getByRole("textbox", { name: "Full Name" }).fill(PAYER.fullName);
    await payment.getByRole("textbox", { name: "Email Address" }).fill(PAYER.email);
    await payment.getByRole("textbox", { name: "Phone Number" }).fill(PAYER.phone);
    await payment.locator('input[type="file"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64"
      ),
    });
    await expect(payment.getByText("receipt.png selected")).toBeVisible();
    await payment.getByRole("button", { name: "Send Receipt" }).click();

    // ── Being verified ──
    await page.waitForURL(/\/checkout\/confirmation\?email=/);
    await expect(page.getByRole("heading", { name: "Payment Received" })).toBeVisible();
    await expect(page.getByText(/typically in less than 30 minutes/)).toBeVisible();

    // What reached the API: the payer, the exact amount, the order choices and
    // the receipt file, as one multipart request.
    expect(submission).not.toBeNull();
    const sent = submission as unknown as { contentType: string; body: string };
    expect(sent.contentType).toContain("multipart/form-data");
    const field = (name: string) =>
      sent.body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
    expect(field("payerName")).toBe(PAYER.fullName);
    expect(field("payerEmail")).toBe(PAYER.email);
    expect(field("payerPhone")).toBe(PAYER.phone);
    expect(Number(field("amount"))).toBe(selected.basePrice);
    expect(field("currency")).toBe("NGN");
    expect(JSON.parse(field("metadata") ?? "{}")).toMatchObject({
      packageSlug: selected.slug,
      bookSize: "A5",
      paperColor: "cream",
      lamination: "matt",
      totalPrice: selected.basePrice,
      email: PAYER.email,
    });
    expect(sent.body).toContain('filename="receipt.png"');
  });

  test("an admin approves the transfer from the pending queue", async ({ page }) => {
    test.slow();
    await seedSession(page, "SUPER_ADMIN");

    let approved = false;
    let approvalBody: unknown = null;
    await page.route("**/api/v1/admin/payments/pending-bank-transfers", (route) =>
      fulfillJson(route, {
        items: approved ? [] : [pendingTransfer(75_000)],
        totalItems: approved ? 0 : 1,
        refreshedAt: new Date().toISOString(),
      })
    );
    await page.route("**/api/v1/admin/payments?*", (route) =>
      fulfillJson(route, {
        items: [],
        nextCursor: null,
        hasMore: false,
        totalItems: 0,
        limit: 20,
        sortBy: "createdAt",
        sortDirection: "desc",
        sortableFields: ["createdAt", "amount"],
      })
    );
    await page.route("**/api/v1/admin/payments/*/approve-transfer", async (route) => {
      approvalBody = route.request().postDataJSON();
      approved = true;
      await fulfillJson(route, {
        id: "cmpaybanktransfer00000001",
        status: "SUCCESS",
        message: "Bank transfer approved.",
      });
    });

    await page.goto("/admin/payments");
    await expect(page.getByText("Pending Bank Transfers").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(PAYER.fullName).locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("1 pending approval", { exact: true })).toBeVisible();

    const approve = page.getByRole("button", { name: "Approve & Send Registration Link" }).first();

    // At 1280px beside the sidebar, the queue must not need a sideways scroll
    // to reach the actions.
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 1280) {
      const box = await approve.boundingBox();
      expect(box, "Approve button is rendered").not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
      const scrolls = await approve.evaluate((button) => {
        const scroller = button.closest(".overflow-x-auto");
        return scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false;
      });
      expect(scrolls, "pending-transfer table scrolls sideways").toBe(false);
    }

    // Approving is confirmed first; cancelling sends nothing.
    await approve.click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText("Approve this bank transfer?")).toBeVisible();
    await expect(
      confirm.getByText(new RegExp(`registration link to ${PAYER.email}`))
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    expect(approvalBody).toBeNull();

    await approve.click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve & Send Link" }).click();

    await expect(page.getByText("Bank transfer approved").first()).toBeVisible();
    expect(approvalBody).not.toBeNull();
    await expect(page.getByText("No bank transfers are waiting")).toBeVisible();
  });
});
