import { expect, type Page, test } from "@playwright/test";

const BOOK_ID = "cmbook_smoke_1";
const ORDER_ID = "cmorder_smoke_1";
const BOOKS_PATH = `/dashboard/books?bookId=${BOOK_ID}`;
const CURRENT_HTML_URL = "https://storage.test/books/current.html";
const PREVIEW_DESTINATION_URL = "https://storage.test/books/preview-open";
const PAYMENT_DESTINATION_URL = "https://pay.example/checkout/extra-pages";

type FlowState = {
  pageSize: "A4" | "A5" | null;
  fontSize: 11 | 12 | 14 | null;
  uploaded: boolean;
  extraPagesPaid: boolean;
  approved: boolean;
};

async function mockDashboardShellApis(page: Page) {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user-id",
          email: "author@example.com",
          role: "USER",
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/v1/notifications/unread-count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ unreadCount: 2 }),
    });
  });

  await page.route("**/api/v1/reviews/my", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hasAnyPrintedBook: false }),
    });
  });
}

function buildBookProgressPayload(state: FlowState) {
  const currentStatus = state.approved
    ? "APPROVED"
    : state.uploaded
      ? "PREVIEW_READY"
      : "PAYMENT_RECEIVED";

  const timeline = state.approved
    ? [
        { status: "PAYMENT_RECEIVED", state: "COMPLETED", reachedAt: "2026-03-07T09:00:00.000Z" },
        { status: "FORMATTING", state: "COMPLETED", reachedAt: "2026-03-07T09:15:00.000Z" },
        { status: "PREVIEW_READY", state: "COMPLETED", reachedAt: "2026-03-07T09:30:00.000Z" },
        { status: "APPROVED", state: "CURRENT", reachedAt: "2026-03-07T09:45:00.000Z" },
      ]
    : state.uploaded
      ? [
          {
            status: "PAYMENT_RECEIVED",
            state: "COMPLETED",
            reachedAt: "2026-03-07T09:00:00.000Z",
          },
          { status: "FORMATTING", state: "COMPLETED", reachedAt: "2026-03-07T09:15:00.000Z" },
          { status: "PREVIEW_READY", state: "CURRENT", reachedAt: "2026-03-07T09:30:00.000Z" },
        ]
      : [{ status: "PAYMENT_RECEIVED", state: "CURRENT", reachedAt: "2026-03-07T09:00:00.000Z" }];

  return {
    id: BOOK_ID,
    bookId: BOOK_ID,
    orderId: ORDER_ID,
    status: currentStatus,
    timeline,
    pageSize: state.pageSize,
    fontSize: state.fontSize,
    wordCount: state.uploaded ? 42000 : null,
    estimatedPages: state.uploaded ? 146 : null,
    pageCount: state.uploaded ? 172 : null,
    currentHtmlUrl: state.uploaded ? CURRENT_HTML_URL : null,
    previewPdfUrl: state.uploaded ? PREVIEW_DESTINATION_URL : null,
    finalPdfUrl: null,
    updatedAt: "2026-03-07T09:45:00.000Z",
  };
}

function buildOrderDetailPayload(state: FlowState) {
  const status = state.approved
    ? "APPROVED"
    : state.extraPagesPaid
      ? "PREVIEW_READY"
      : state.uploaded
        ? "PENDING_EXTRA_PAYMENT"
        : "PAID";

  return {
    id: ORDER_ID,
    orderId: ORDER_ID,
    orderNumber: "BP-2026-0001",
    status,
    extraAmount: state.uploaded ? 220 : 0,
    payments:
      state.extraPagesPaid || state.approved
        ? [
            {
              id: "pay_extra_1",
              provider: "PAYSTACK",
              status: "SUCCESS",
              type: "EXTRA_PAGES",
              amount: 220,
              currency: "NGN",
              providerRef: "ep_ref_smoke_1",
              createdAt: "2026-03-07T09:35:00.000Z",
            },
          ]
        : [],
  };
}

test.describe("Book Workspace Smoke", () => {
  test("mobile smoke: upload to preview to billing gate to approve", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "Smoke suite runs on mobile Chrome only.");

    const state: FlowState = {
      pageSize: null,
      fontSize: null,
      uploaded: false,
      extraPagesPaid: false,
      approved: false,
    };
    let settingsPatchCount = 0;
    let uploadCount = 0;
    let previewEndpointCount = 0;
    let approveCount = 0;
    let sawMultipartUpload = false;
    let sawExtraPagesPayload = false;

    await mockDashboardShellApis(page);

    await page.route(`**/api/v1/books/${BOOK_ID}/settings`, async (route) => {
      settingsPatchCount += 1;
      const payload = route.request().postDataJSON() as {
        pageSize?: FlowState["pageSize"];
        fontSize?: FlowState["fontSize"];
      };
      state.pageSize = payload.pageSize ?? null;
      state.fontSize = payload.fontSize ?? null;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: BOOK_ID,
          pageSize: state.pageSize,
          fontSize: state.fontSize,
          wordCount: null,
          estimatedPages: null,
          updatedAt: "2026-03-07T09:05:00.000Z",
        }),
      });
    });

    await page.route(`**/api/v1/books/${BOOK_ID}/upload`, async (route) => {
      uploadCount += 1;
      const contentType = route.request().headers()["content-type"] ?? "";
      sawMultipartUpload = contentType.includes("multipart/form-data");

      state.uploaded = true;

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          bookId: BOOK_ID,
          fileId: "file_raw_1",
          fileUrl: "https://storage.test/books/raw.docx",
          fileName: "smoke-manuscript.docx",
          fileSize: 2048,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          pageSize: state.pageSize,
          fontSize: state.fontSize,
          wordCount: 42000,
          estimatedPages: 146,
        }),
      });
    });

    await page.route(`**/api/v1/books/${BOOK_ID}/preview`, async (route) => {
      previewEndpointCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bookId: BOOK_ID,
          previewPdfUrl: PREVIEW_DESTINATION_URL,
          status: "PREVIEW_READY",
          watermarked: true,
        }),
      });
    });

    await page.route(`**/api/v1/books/${BOOK_ID}/approve`, async (route) => {
      approveCount += 1;
      state.approved = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bookId: BOOK_ID,
          bookStatus: "APPROVED",
          orderStatus: "APPROVED",
          queuedJob: {
            queue: "pdf-generation",
            name: "generate-pdf",
            jobId: "pdf_job_smoke_1",
          },
        }),
      });
    });

    await page.route(`**/api/v1/books/${BOOK_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildBookProgressPayload(state)),
      });
    });

    await page.route(`**/api/v1/orders/${ORDER_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildOrderDetailPayload(state)),
      });
    });

    await page.route("**/api/v1/payments/gateways", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "gateway_paystack",
            provider: "PAYSTACK",
            name: "Paystack",
            isEnabled: true,
            isTestMode: true,
            bankDetails: null,
            instructions: null,
            priority: 0,
          },
        ]),
      });
    });

    await page.route("**/api/v1/payments/extra-pages", async (route) => {
      const payload = route.request().postDataJSON() as { extraPages?: number; bookId?: string };
      sawExtraPagesPayload = payload.bookId === BOOK_ID && payload.extraPages === 22;
      state.extraPagesPaid = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authorizationUrl: PAYMENT_DESTINATION_URL,
          reference: "ep_ref_smoke_1",
          provider: "PAYSTACK",
          paymentId: "payment_smoke_1",
        }),
      });
    });

    await page.route(CURRENT_HTML_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<article><h1>Smoke Preview</h1><p>This formatted manuscript preview is ready.</p></article>",
      });
    });

    await page.route(PREVIEW_DESTINATION_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Preview PDF</h1></body></html>",
      });
    });

    await page.route(PAYMENT_DESTINATION_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Extra Pages Checkout</h1></body></html>",
      });
    });

    await page.goto(BOOKS_PATH);

    await expect(
      page.getByRole("heading", { name: "Book Production Progress", level: 1 })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Manuscript Upload", level: 2 })).toBeVisible();

    await page.getByRole("button", { name: /^A5/ }).click();
    await page.getByRole("button", { name: "12pt" }).click();
    await page.getByRole("button", { name: "Save Settings" }).click();

    await expect(
      page.getByRole("button", { name: "Manuscript drag and drop upload area" })
    ).toBeVisible();
    expect(settingsPatchCount).toBe(1);

    await page.locator('input[type="file"]').setInputFiles({
      name: "smoke-manuscript.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("Smoke manuscript content"),
    });

    await expect(page.getByRole("button", { name: "Upload Another File" })).toBeVisible();
    await expect(page.getByText("Word count: 42,000")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Live layout preview", level: 2 })
    ).toBeVisible();
    await expect(
      page.frameLocator("iframe").getByRole("heading", { name: "Smoke Preview" })
    ).toBeVisible();
    await expect(page.getByText("Extra-page payment required")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay Extra Pages" })).toBeVisible();
    expect(uploadCount).toBe(1);
    expect(sawMultipartUpload).toBe(true);
    expect(previewEndpointCount).toBe(0);

    await page.getByRole("button", { name: "Review Preview" }).click();
    await expect.poll(() => previewEndpointCount).toBe(1);

    await page.getByRole("button", { name: "Pay Extra Pages" }).click();
    await expect(page).toHaveURL(/pay\.example\/checkout\/extra-pages/);
    expect(sawExtraPagesPayload).toBe(true);

    await page.goto(BOOKS_PATH);

    await expect(page.getByText("Approval is unlocked")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve for Production" })).toBeVisible();

    await page.getByRole("button", { name: "Approve for Production" }).click();

    await expect(
      page.getByText("Book approved. Final PDF generation has been queued.")
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Approved for production", level: 2 })
    ).toBeVisible();
    expect(approveCount).toBe(1);
  });
});
