import { expect, type Page, test } from "@playwright/test";

const ORDER_ID = "cmadminorder00000000000000001";
const SECOND_ORDER_ID = "cmadminorder00000000000000002";
const PAYMENT_ID = "cmadminpayment00000000000001";
const USER_ID = "cmadminuser00000000000000001";
const SECOND_USER_ID = "cmadminuser00000000000000002";
const THIRD_USER_ID = "cmadminuser00000000000000003";
const DEFAULT_FRONTEND_ORIGIN = "http://localhost:3000";

type MockAdminApiOptions = {
  pageSize?: number;
  delayOrdersMs?: number;
};

type MockAdminUserApiOptions = {
  pageSize?: number;
  delayUsersMs?: number;
};

function buildCorsHeaders(pageOrigin?: string) {
  return {
    "access-control-allow-origin": pageOrigin ?? DEFAULT_FRONTEND_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    vary: "Origin",
  };
}

function getRequestOrigin(page: Page, requestUrl: string) {
  return page.url() ? new URL(page.url()).origin : new URL(requestUrl).origin;
}

async function fulfillJson(
  page: Page,
  route: Parameters<Parameters<Page["route"]>[1]>[0],
  body: unknown,
  status = 200
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: buildCorsHeaders(getRequestOrigin(page, route.request().url())),
    body: JSON.stringify(body),
  });
}

async function fulfillPreflight(page: Page, route: Parameters<Parameters<Page["route"]>[1]>[0]) {
  await route.fulfill({
    status: 204,
    headers: buildCorsHeaders(getRequestOrigin(page, route.request().url())),
  });
}

function compareStrings(left: string, right: string, direction: "asc" | "desc") {
  const comparison = left.localeCompare(right, undefined, { sensitivity: "base" });
  return direction === "asc" ? comparison : -comparison;
}

function compareNumbers(left: number, right: number, direction: "asc" | "desc") {
  const comparison = left - right;
  return direction === "asc" ? comparison : -comparison;
}

function sortAdminOrders(
  items: ReturnType<typeof buildAdminOrdersList>,
  sortBy: string,
  sortDirection: "asc" | "desc"
) {
  return [...items].sort((left, right) => {
    switch (sortBy) {
      case "orderNumber":
        return compareStrings(left.orderNumber, right.orderNumber, sortDirection);
      case "customerName":
        return compareStrings(left.customer.fullName, right.customer.fullName, sortDirection);
      case "customerEmail":
        return compareStrings(left.customer.email, right.customer.email, sortDirection);
      case "packageName":
        return compareStrings(left.package.name, right.package.name, sortDirection);
      case "displayStatus":
        return compareStrings(left.displayStatus, right.displayStatus, sortDirection);
      case "totalAmount":
        return compareNumbers(left.totalAmount, right.totalAmount, sortDirection);
      default:
        return compareStrings(left.createdAt, right.createdAt, sortDirection);
    }
  });
}

function sleep(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function isFocused(locator: ReturnType<Page["locator"]>) {
  try {
    return await locator.evaluate((node) => node === document.activeElement);
  } catch {
    return false;
  }
}

async function tabUntilFocused(page: Page, locator: ReturnType<Page["locator"]>, maxTabs = 20) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await isFocused(locator)) {
      return;
    }
  }

  throw new Error("Unable to focus target element with keyboard navigation");
}

function parseRgb(color: string): [number, number, number] {
  const parts = color.match(/\d+(\.\d+)?/g) ?? [];
  const [r = "0", g = "0", b = "0"] = parts;
  return [Number(r), Number(g), Number(b)];
}

function toLinear(channel: number) {
  const normalized = channel / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]) {
  const fgLuminance =
    0.2126 * toLinear(foreground[0]) +
    0.7152 * toLinear(foreground[1]) +
    0.0722 * toLinear(foreground[2]);
  const bgLuminance =
    0.2126 * toLinear(background[0]) +
    0.7152 * toLinear(background[1]) +
    0.0722 * toLinear(background[2]);

  const light = Math.max(fgLuminance, bgLuminance);
  const dark = Math.min(fgLuminance, bgLuminance);

  return (light + 0.05) / (dark + 0.05);
}

function buildAdminOrdersList() {
  return [
    {
      id: ORDER_ID,
      orderNumber: "BP-2026-0001",
      customer: {
        id: "cmadminuser0000000000000001",
        fullName: "Ada Okafor",
        email: "ada@example.com",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
      },
      package: {
        id: "cmpackage000000000000000001",
        name: "Signature Memoir",
        slug: "signature-memoir",
      },
      orderStatus: "FORMATTING",
      bookStatus: null,
      displayStatus: "FORMATTING",
      statusSource: "order",
      createdAt: "2026-03-10T09:30:00.000Z",
      totalAmount: 100000,
      currency: "NGN",
      detailUrl: `/admin/orders/${ORDER_ID}`,
    },
    {
      id: SECOND_ORDER_ID,
      orderNumber: "BP-2026-0002",
      customer: {
        id: "cmadminuser0000000000000002",
        fullName: "Grace Bello",
        email: "grace@example.com",
        phoneNumber: "+2348098765432",
        preferredLanguage: "en",
      },
      package: {
        id: "cmpackage000000000000000002",
        name: "Founder Legacy",
        slug: "founder-legacy",
      },
      orderStatus: "APPROVED",
      bookStatus: null,
      displayStatus: "APPROVED",
      statusSource: "order",
      createdAt: "2026-03-11T12:00:00.000Z",
      totalAmount: 150000,
      currency: "NGN",
      detailUrl: `/admin/orders/${SECOND_ORDER_ID}`,
    },
  ];
}

function buildAdminOrderDetail() {
  return {
    id: ORDER_ID,
    orderNumber: "BP-2026-0001",
    orderType: "STANDARD",
    orderStatus: "FORMATTING",
    bookStatus: null,
    displayStatus: "FORMATTING",
    statusSource: "order",
    orderVersion: 3,
    createdAt: "2026-03-10T09:30:00.000Z",
    updatedAt: "2026-03-11T08:15:00.000Z",
    customer: {
      id: "cmadminuser0000000000000001",
      fullName: "Ada Okafor",
      email: "ada@example.com",
      phoneNumber: "+2348012345678",
      preferredLanguage: "en",
    },
    package: {
      id: "cmpackage000000000000000001",
      name: "Signature Memoir",
      slug: "signature-memoir",
    },
    shippingAddress: {
      street: "12 Marina Road",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      zipCode: "100001",
    },
    book: null,
    copies: 3,
    bookSize: "A5",
    paperColor: "Cream",
    lamination: "Matte",
    initialAmount: 85000,
    extraAmount: 15000,
    discountAmount: 0,
    totalAmount: 100000,
    refundAmount: 0,
    refundReason: null,
    refundedAt: null,
    refundedBy: null,
    currency: "NGN",
    trackingNumber: "TRK-5001",
    shippingProvider: "DHL",
    addons: [
      {
        id: "cmaddonrecord00000000000001",
        addonId: "cmaddon000000000000000001",
        name: "Rush Delivery",
        price: 15000,
        wordCount: 42000,
      },
    ],
    payments: [
      {
        id: PAYMENT_ID,
        provider: "PAYSTACK",
        status: "SUCCESS",
        type: "ORDER_PAYMENT",
        amount: 100000,
        currency: "NGN",
        providerRef: "PSK-REF-001",
        receiptUrl: "https://example.com/receipt.pdf",
        payerName: "Ada Okafor",
        payerEmail: "ada@example.com",
        payerPhone: "+2348012345678",
        adminNote: "Primary order payment",
        approvedAt: "2026-03-10T10:00:00.000Z",
        approvedBy: "cmadmin000000000000000001",
        processedAt: "2026-03-10T10:05:00.000Z",
        isRefundable: true,
        createdAt: "2026-03-10T09:45:00.000Z",
        updatedAt: "2026-03-10T10:05:00.000Z",
      },
    ],
    timeline: [
      {
        key: "ORDER_CREATED",
        label: "Order Created",
        status: "PAID",
        source: "order",
        state: "completed",
        reachedAt: "2026-03-10T09:30:00.000Z",
      },
      {
        key: "FORMATTING",
        label: "Formatting",
        status: "FORMATTING",
        source: "order",
        state: "current",
        reachedAt: "2026-03-11T08:00:00.000Z",
      },
    ],
    refundPolicy: {
      calculatedAt: "2026-03-12T09:00:00.000Z",
      statusSource: "order",
      stage: "FORMATTING",
      stageLabel: "Formatting",
      eligible: true,
      policyDecision: "PARTIAL",
      allowedRefundTypes: ["PARTIAL", "CUSTOM"],
      recommendedRefundType: "PARTIAL",
      orderTotalAmount: 100000,
      recommendedAmount: 70000,
      maxRefundAmount: 70000,
      policyPercent: 70,
      policyMessage:
        "Eligible for up to 70% refund because production work has started but the order is not yet approved.",
    },
    statusControl: {
      currentStatus: "FORMATTING",
      expectedVersion: 3,
      nextAllowedStatuses: ["PREVIEW_READY", "ACTION_REQUIRED", "CANCELLED"],
    },
  };
}

function buildAdminUsersList() {
  return [
    {
      id: USER_ID,
      fullName: "Ada Okafor",
      email: "ada@example.com",
      role: "EDITOR",
      isVerified: true,
      isActive: true,
      createdAt: "2026-03-12T14:45:00.000Z",
      detailUrl: `/admin/users/${USER_ID}`,
    },
    {
      id: SECOND_USER_ID,
      fullName: "Grace Bello",
      email: "grace@example.com",
      role: "ADMIN",
      isVerified: true,
      isActive: true,
      createdAt: "2026-03-11T12:00:00.000Z",
      detailUrl: `/admin/users/${SECOND_USER_ID}`,
    },
    {
      id: THIRD_USER_ID,
      fullName: "John Duru",
      email: "john@example.com",
      role: "USER",
      isVerified: false,
      isActive: true,
      createdAt: "2026-03-10T08:45:00.000Z",
      detailUrl: `/admin/users/${THIRD_USER_ID}`,
    },
  ];
}

function buildAdminUserDetails() {
  return {
    [USER_ID]: {
      profile: {
        id: USER_ID,
        firstName: "Ada",
        lastName: "Okafor",
        fullName: "Ada Okafor",
        email: "ada@example.com",
        phoneNumber: "+2348000000000",
        role: "EDITOR",
        isVerified: true,
        isActive: true,
        preferredLanguage: "en",
        bio: "Author of literary fiction and essays.",
        profileImageUrl: null,
        whatsAppNumber: "+2348000000000",
        websiteUrl: "https://ada.example.com",
        purchaseLinks: [
          {
            label: "Storefront",
            url: "https://store.example.com/ada",
          },
        ],
        socialLinks: [
          {
            platform: "Instagram",
            url: "https://instagram.com/ada",
          },
        ],
        isProfileComplete: true,
        notificationPreferences: {
          email: true,
          whatsApp: false,
          inApp: true,
        },
        createdAt: "2026-03-10T09:30:00.000Z",
        updatedAt: "2026-03-12T14:45:00.000Z",
      },
      orders: [
        {
          id: ORDER_ID,
          orderNumber: "BP-2026-0001",
          orderType: "STANDARD",
          orderStatus: "FORMATTING",
          bookStatus: "FORMATTING",
          package: {
            id: "cmpackage000000000000000001",
            name: "Signature Memoir",
            slug: "signature-memoir",
          },
          totalAmount: 100000,
          currency: "NGN",
          createdAt: "2026-03-10T09:30:00.000Z",
          detailUrl: `/admin/orders/${ORDER_ID}`,
        },
      ],
      books: [
        {
          id: "cmadminbook00000000000000001",
          title: "The Lagos Chronicle",
          status: "FORMATTING",
          productionStatus: "FORMATTING_REVIEW",
          orderId: ORDER_ID,
          orderNumber: "BP-2026-0001",
          createdAt: "2026-03-10T11:00:00.000Z",
          updatedAt: "2026-03-12T08:30:00.000Z",
          detailUrl: "/admin/books/cmadminbook00000000000000001",
          orderDetailUrl: `/admin/orders/${ORDER_ID}`,
        },
      ],
      payments: [
        {
          id: PAYMENT_ID,
          orderId: ORDER_ID,
          orderNumber: "BP-2026-0001",
          provider: "PAYSTACK",
          type: "ORDER_PAYMENT",
          status: "SUCCESS",
          amount: 100000,
          currency: "NGN",
          providerRef: "PSK-REF-001",
          receiptUrl: "https://example.com/receipt.pdf",
          approvedAt: "2026-03-10T10:10:00.000Z",
          processedAt: "2026-03-10T10:08:00.000Z",
          createdAt: "2026-03-10T10:05:00.000Z",
          updatedAt: "2026-03-10T10:10:00.000Z",
          orderDetailUrl: `/admin/orders/${ORDER_ID}`,
        },
      ],
    },
    [SECOND_USER_ID]: {
      profile: {
        id: SECOND_USER_ID,
        firstName: "Grace",
        lastName: "Bello",
        fullName: "Grace Bello",
        email: "grace@example.com",
        phoneNumber: "+2348098765432",
        role: "ADMIN",
        isVerified: true,
        isActive: true,
        preferredLanguage: "en",
        bio: null,
        profileImageUrl: null,
        whatsAppNumber: null,
        websiteUrl: null,
        purchaseLinks: [],
        socialLinks: [],
        isProfileComplete: false,
        notificationPreferences: {
          email: true,
          whatsApp: true,
          inApp: true,
        },
        createdAt: "2026-03-11T12:00:00.000Z",
        updatedAt: "2026-03-12T12:15:00.000Z",
      },
      orders: [],
      books: [],
      payments: [],
    },
    [THIRD_USER_ID]: {
      profile: {
        id: THIRD_USER_ID,
        firstName: "John",
        lastName: "Duru",
        fullName: "John Duru",
        email: "john@example.com",
        phoneNumber: "+2348076543210",
        role: "USER",
        isVerified: false,
        isActive: true,
        preferredLanguage: "en",
        bio: null,
        profileImageUrl: null,
        whatsAppNumber: null,
        websiteUrl: null,
        purchaseLinks: [],
        socialLinks: [],
        isProfileComplete: false,
        notificationPreferences: {
          email: true,
          whatsApp: false,
          inApp: false,
        },
        createdAt: "2026-03-10T08:45:00.000Z",
        updatedAt: "2026-03-10T08:45:00.000Z",
      },
      orders: [],
      books: [],
      payments: [],
    },
  };
}

function sortAdminUsers(
  items: ReturnType<typeof buildAdminUsersList>,
  sortBy: string,
  sortDirection: "asc" | "desc"
) {
  return [...items].sort((left, right) => {
    switch (sortBy) {
      case "fullName":
        return compareStrings(left.fullName, right.fullName, sortDirection);
      case "email":
        return compareStrings(left.email, right.email, sortDirection);
      case "role":
        return compareStrings(left.role, right.role, sortDirection);
      case "isVerified":
        return compareNumbers(Number(left.isVerified), Number(right.isVerified), sortDirection);
      default:
        return compareStrings(left.createdAt, right.createdAt, sortDirection);
    }
  });
}

async function mockAdminApis(page: Page, options: MockAdminApiOptions = {}) {
  const packages = [
    {
      id: "cmpackage000000000000000001",
      name: "Signature Memoir",
      slug: "signature-memoir",
      description: "Premium memoir package",
      basePrice: 85000,
      pageLimit: 200,
      includesISBN: true,
      features: {
        items: ["Interior formatting", "Cover design"],
        copies: {
          A4: 1,
          A5: 3,
          A6: 5,
        },
      },
      isActive: true,
      sortOrder: 1,
      category: {
        id: "cmcategory0000000000000001",
        name: "Memoir",
        slug: "memoir",
        description: "Memoir packages",
        copies: 3,
        isActive: true,
        sortOrder: 1,
      },
    },
    {
      id: "cmpackage000000000000000002",
      name: "Founder Legacy",
      slug: "founder-legacy",
      description: "Executive biography package",
      basePrice: 150000,
      pageLimit: 240,
      includesISBN: true,
      features: {
        items: ["Editorial review", "Priority production"],
        copies: {
          A4: 1,
          A5: 2,
          A6: 4,
        },
      },
      isActive: true,
      sortOrder: 2,
      category: {
        id: "cmcategory0000000000000002",
        name: "Biography",
        slug: "biography",
        description: "Biography packages",
        copies: 2,
        isActive: true,
        sortOrder: 2,
      },
    },
  ];

  let listItems = buildAdminOrdersList();
  let detail = buildAdminOrderDetail();
  let lastStatusPayload: Record<string, unknown> | null = null;
  let lastRefundPayload: Record<string, unknown> | null = null;

  await page.route("**/auth/me*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    await fulfillJson(page, route, {
      user: {
        id: "cmadmin000000000000000001",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        role: "SUPER_ADMIN",
        displayName: "Admin User",
        initials: "AU",
      },
    });
  });

  await page.route("**/auth/refresh*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    await fulfillJson(page, route, {});
  });

  await page.route("**/notifications/unread-count*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    await fulfillJson(page, route, { unreadCount: 0 });
  });

  await page.route("**/packages*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    await fulfillJson(page, route, packages);
  });

  await page.route("**/api/v1/admin/orders?*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    if (options.delayOrdersMs) {
      await sleep(options.delayOrdersMs);
    }

    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const cursor = url.searchParams.get("cursor");
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    const packageId = url.searchParams.get("packageId");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const sortBy = url.searchParams.get("sortBy") ?? "createdAt";
    const sortDirection = url.searchParams.get("sortDirection") ?? "desc";

    let filteredItems = [...listItems];

    if (status) {
      filteredItems = filteredItems.filter((item) => item.displayStatus === status);
    }

    if (packageId) {
      filteredItems = filteredItems.filter((item) => item.package.id === packageId);
    }

    if (query) {
      filteredItems = filteredItems.filter((item) =>
        [item.orderNumber, item.customer.fullName, item.customer.email, item.package.name]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }

    filteredItems = sortAdminOrders(filteredItems, sortBy, sortDirection as "asc" | "desc");

    const pageSize = Math.max(1, options.pageSize ?? limit);
    const startIndex = cursor
      ? Math.max(
          0,
          (() => {
            const index = filteredItems.findIndex((item) => item.id === cursor);
            return index >= 0 ? index + 1 : 0;
          })()
        )
      : 0;
    const pageSlice = filteredItems.slice(startIndex, startIndex + pageSize + 1);
    const hasMore = pageSlice.length > pageSize;
    const pageItems = hasMore ? pageSlice.slice(0, pageSize) : pageSlice;

    await fulfillJson(page, route, {
      items: pageItems,
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
      totalItems: filteredItems.length,
      limit,
      sortBy,
      sortDirection,
      sortableFields: [
        "orderNumber",
        "customerName",
        "customerEmail",
        "packageName",
        "displayStatus",
        "createdAt",
        "totalAmount",
      ],
    });
  });

  await page.route(/\/api\/v1\/admin\/orders\/[^/?]+$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(page, route, detail);
  });

  await page.route(/\/api\/v1\/admin\/orders\/[^/]+\/status$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    lastStatusPayload = route.request().postDataJSON() as Record<string, unknown>;
    const nextStatus = String(lastStatusPayload.nextStatus);

    detail = {
      ...detail,
      orderStatus: nextStatus,
      displayStatus: nextStatus,
      orderVersion: detail.orderVersion + 1,
      updatedAt: "2026-03-12T10:00:00.000Z",
      timeline: [
        ...detail.timeline.slice(0, 1),
        {
          key: nextStatus,
          label: nextStatus
            .toLowerCase()
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
          status: nextStatus,
          source: "order",
          state: "current",
          reachedAt: "2026-03-12T10:00:00.000Z",
        },
      ],
      refundPolicy: {
        ...detail.refundPolicy,
        stage: nextStatus,
        stageLabel: nextStatus
          .toLowerCase()
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
      },
      statusControl: {
        currentStatus: nextStatus,
        expectedVersion: detail.orderVersion + 1,
        nextAllowedStatuses: ["APPROVED", "ACTION_REQUIRED", "CANCELLED"],
      },
    };

    listItems = listItems.map((item) =>
      item.id === detail.id
        ? {
            ...item,
            orderStatus: nextStatus,
            displayStatus: nextStatus,
          }
        : item
    );

    await fulfillJson(page, route, {
      orderId: detail.id,
      previousStatus: "FORMATTING",
      nextStatus,
      displayStatus: nextStatus,
      statusSource: "order",
      orderVersion: detail.orderVersion,
      updatedAt: detail.updatedAt,
      audit: {
        auditId: "cmaudit000000000000000001",
        action: "ORDER_STATUS_UPDATED",
        entityType: "ORDER",
        entityId: detail.id,
        recordedAt: detail.updatedAt,
        recordedBy: "cmadmin000000000000000001",
        note: (lastStatusPayload.note as string | undefined) ?? null,
        reason: (lastStatusPayload.reason as string | undefined) ?? null,
      },
    });
  });

  await page.route(/\/api\/v1\/admin\/payments\/[^/]+\/refund$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    lastRefundPayload = route.request().postDataJSON() as Record<string, unknown>;
    const refundAmount = Number(
      lastRefundPayload.customAmount ?? detail.refundPolicy.recommendedAmount
    );
    const refundReason = String(lastRefundPayload.reason ?? "");

    detail = {
      ...detail,
      orderStatus: "REFUNDED",
      displayStatus: "REFUNDED",
      orderVersion: detail.orderVersion + 1,
      refundAmount,
      refundReason,
      refundedAt: "2026-03-12T10:15:00.000Z",
      updatedAt: "2026-03-12T10:15:00.000Z",
      payments: detail.payments.map((payment) =>
        payment.id === PAYMENT_ID
          ? {
              ...payment,
              status: "REFUNDED",
              isRefundable: false,
              updatedAt: "2026-03-12T10:15:00.000Z",
            }
          : payment
      ),
      refundPolicy: {
        ...detail.refundPolicy,
        eligible: false,
        policyDecision: "NONE",
        allowedRefundTypes: [],
        recommendedRefundType: null,
        recommendedAmount: 0,
        maxRefundAmount: 0,
        policyPercent: 0,
        policyMessage: "This order is not eligible for a refund at its current stage.",
      },
      statusControl: {
        currentStatus: "REFUNDED",
        expectedVersion: detail.orderVersion + 1,
        nextAllowedStatuses: [],
      },
    };

    listItems = listItems.map((item) =>
      item.id === detail.id
        ? {
            ...item,
            orderStatus: "REFUNDED",
            displayStatus: "REFUNDED",
          }
        : item
    );

    await fulfillJson(page, route, {
      orderId: detail.id,
      paymentId: PAYMENT_ID,
      refundPaymentId: "cmrefundpayment0000000000001",
      provider: "PAYSTACK",
      processingMode: "gateway",
      refundType: lastRefundPayload.type,
      refundedAmount: refundAmount,
      currency: "NGN",
      paymentStatus: "REFUNDED",
      providerRefundReference: "rfnd_001",
      orderStatus: "REFUNDED",
      bookStatus: null,
      refundedAt: "2026-03-12T10:15:00.000Z",
      refundReason,
      orderVersion: detail.orderVersion,
      bookVersion: null,
      emailSent: true,
      policySnapshot: {
        calculatedAt: "2026-03-12T09:00:00.000Z",
        statusSource: "order",
        stage: "PREVIEW_READY",
        stageLabel: "Preview Ready",
        eligible: true,
        policyDecision: "PARTIAL",
        allowedRefundTypes: ["PARTIAL", "CUSTOM"],
        recommendedRefundType: "PARTIAL",
        orderTotalAmount: 100000,
        recommendedAmount: 70000,
        maxRefundAmount: 70000,
        policyPercent: 70,
        policyMessage:
          "Eligible for up to 70% refund because production work has started but the order is not yet approved.",
      },
      audit: {
        auditId: "cmaudit000000000000000002",
        action: "ORDER_REFUNDED",
        entityType: "ORDER",
        entityId: detail.id,
        recordedAt: "2026-03-12T10:15:00.000Z",
        recordedBy: "cmadmin000000000000000001",
        note: (lastRefundPayload.note as string | undefined) ?? null,
        reason: refundReason,
      },
    });
  });

  return {
    getLastStatusPayload: () => lastStatusPayload,
    getLastRefundPayload: () => lastRefundPayload,
  };
}

async function mockAdminUserApis(page: Page, options: MockAdminUserApiOptions = {}) {
  let listItems = buildAdminUsersList();
  let detailById = buildAdminUserDetails();
  let lastUpdatePayload: Record<string, unknown> | null = null;
  let lastAuditAction: string | null = null;

  await page.route("**/auth/me*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    await fulfillJson(page, route, {
      user: {
        id: "cmadmin000000000000000001",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        role: "SUPER_ADMIN",
        displayName: "Admin User",
        initials: "AU",
      },
    });
  });

  await page.route("**/auth/refresh*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    await fulfillJson(page, route, {});
  });

  await page.route("**/notifications/unread-count*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    await fulfillJson(page, route, { unreadCount: 0 });
  });

  await page.route("**/api/v1/admin/users?*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    if (options.delayUsersMs) {
      await sleep(options.delayUsersMs);
    }

    const url = new URL(route.request().url());
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    const role = url.searchParams.get("role");
    const isVerified = url.searchParams.get("isVerified");
    const cursor = url.searchParams.get("cursor");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const sortBy = url.searchParams.get("sortBy") ?? "createdAt";
    const sortDirection = (url.searchParams.get("sortDirection") ?? "desc") as "asc" | "desc";

    let filteredItems = [...listItems];

    if (query) {
      filteredItems = filteredItems.filter((item) =>
        [item.fullName, item.email].join(" ").toLowerCase().includes(query)
      );
    }

    if (role) {
      filteredItems = filteredItems.filter((item) => item.role === role);
    }

    if (isVerified === "true" || isVerified === "false") {
      filteredItems = filteredItems.filter((item) => item.isVerified === (isVerified === "true"));
    }

    filteredItems = sortAdminUsers(filteredItems, sortBy, sortDirection);

    const pageSize = Math.max(1, options.pageSize ?? limit);
    const startIndex = cursor
      ? Math.max(
          0,
          (() => {
            const index = filteredItems.findIndex((item) => item.id === cursor);
            return index >= 0 ? index + 1 : 0;
          })()
        )
      : 0;
    const pageSlice = filteredItems.slice(startIndex, startIndex + pageSize + 1);
    const hasMore = pageSlice.length > pageSize;
    const pageItems = hasMore ? pageSlice.slice(0, pageSize) : pageSlice;

    await fulfillJson(page, route, {
      items: pageItems,
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
      totalItems: filteredItems.length,
      limit,
      sortBy,
      sortDirection,
      sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
    });
  });

  await page.route(/\/api\/v1\/admin\/users\/[^/?]+$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    const userId = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const detail = detailById[userId as keyof typeof detailById];

    if (!detail) {
      await fulfillJson(page, route, { message: "User not found" }, 404);
      return;
    }

    if (route.request().method() === "GET") {
      await fulfillJson(page, route, detail);
      return;
    }

    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    lastUpdatePayload = route.request().postDataJSON() as Record<string, unknown>;

    const previousState = {
      role: detail.profile.role,
      isVerified: detail.profile.isVerified,
      isActive: detail.profile.isActive,
    };
    const currentState = {
      role:
        typeof lastUpdatePayload.role === "string"
          ? String(lastUpdatePayload.role)
          : detail.profile.role,
      isVerified:
        typeof lastUpdatePayload.isVerified === "boolean"
          ? Boolean(lastUpdatePayload.isVerified)
          : detail.profile.isVerified,
      isActive:
        typeof lastUpdatePayload.isActive === "boolean"
          ? Boolean(lastUpdatePayload.isActive)
          : detail.profile.isActive,
    };

    if (currentState.isActive === false && previousState.isActive) {
      lastAuditAction = "ADMIN_USER_DEACTIVATED";
    } else if (currentState.role !== previousState.role) {
      lastAuditAction = "ADMIN_USER_ROLE_UPDATED";
    } else if (currentState.isVerified !== previousState.isVerified) {
      lastAuditAction = "ADMIN_USER_VERIFICATION_UPDATED";
    } else {
      lastAuditAction = "ADMIN_USER_UPDATED";
    }

    const recordedAt =
      lastAuditAction === "ADMIN_USER_DEACTIVATED"
        ? "2026-03-14T11:20:00.000Z"
        : "2026-03-14T10:45:00.000Z";

    detailById = {
      ...detailById,
      [userId]: {
        ...detail,
        profile: {
          ...detail.profile,
          role: currentState.role,
          isVerified: currentState.isVerified,
          isActive: currentState.isActive,
          updatedAt: recordedAt,
        },
      },
    };

    listItems = listItems.map((item) =>
      item.id === userId
        ? {
            ...item,
            role: currentState.role,
            isVerified: currentState.isVerified,
            isActive: currentState.isActive,
          }
        : item
    );

    await fulfillJson(page, route, {
      userId,
      previousState,
      currentState,
      updatedAt: recordedAt,
      audit: {
        auditId: "cmaudit000000000000000101",
        action: lastAuditAction,
        entityType: "USER",
        entityId: userId,
        recordedAt,
        recordedBy: "cmadmin000000000000000001",
        note: null,
        reason: null,
      },
    });
  });

  return {
    getLastUpdatePayload: () => lastUpdatePayload,
    getLastAuditAction: () => lastAuditAction,
  };
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 0) < 768;
}

test.describe("Admin Orders", () => {
  test("filters orders and opens the detail workspace", async ({ page }) => {
    await mockAdminApis(page);

    await page.goto("/admin/orders", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Orders" }).first()).toBeVisible();

    if (isMobileViewport(page)) {
      await expect(page.locator("article").filter({ hasText: "BP-2026-0001" })).toHaveCount(1);
      await expect(page.locator("article").filter({ hasText: "BP-2026-0002" })).toHaveCount(1);
    } else {
      const table = page.getByRole("table");
      await expect(table.getByText("BP-2026-0001")).toBeVisible();
      await expect(table.getByText("BP-2026-0002")).toBeVisible();
    }

    await page.getByLabel("Status").selectOption("FORMATTING");

    if (isMobileViewport(page)) {
      await expect(page.locator("article").filter({ hasText: "BP-2026-0001" })).toHaveCount(1);
      await expect(page.locator("article").filter({ hasText: "BP-2026-0002" })).toHaveCount(0);
      await page
        .locator("article")
        .filter({ hasText: "BP-2026-0001" })
        .getByRole("link", { name: "View Order" })
        .click();
    } else {
      const table = page.getByRole("table");
      await expect(table.getByText("BP-2026-0001")).toBeVisible();
      await expect(table.getByText("BP-2026-0002")).toHaveCount(0);
      await table.getByRole("link", { name: "View Order" }).click();
    }

    await expect(page).toHaveURL(new RegExp(`/admin/orders/${ORDER_ID}$`));
    await expect(page.getByRole("heading", { name: "BP-2026-0001" })).toBeVisible();
  });

  test("advances status and completes the refund workflow", async ({ page }) => {
    const api = await mockAdminApis(page);

    await page.goto(`/admin/orders/${ORDER_ID}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "BP-2026-0001" })).toBeVisible();
    await expect(page.getByText("Refund Policy Snapshot")).toBeVisible();

    await page.getByLabel("Reason").fill("Preview is ready for editorial approval.");
    await page.getByLabel("Internal Note").fill("Moving order forward after QA sign-off.");
    await page.getByRole("button", { name: "Advance Status" }).click();

    await expect.poll(() => api.getLastStatusPayload()?.nextStatus).toBe("PREVIEW_READY");
    await expect(page.getByText("Order status updated")).toBeVisible();

    await page.getByRole("button", { name: "Refund Payment" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Process Refund" })).toBeVisible();

    await dialog.getByRole("button", { name: "Custom" }).click();
    await dialog.getByLabel("Custom Amount").fill("50000");
    await dialog
      .getByLabel("Refund Reason")
      .fill("Customer approved a goodwill adjustment before approval.");
    await dialog.getByLabel("Internal Note").fill("Approved by finance manager.");
    await dialog.getByRole("button", { name: "Continue" }).click();

    await expect(dialog.getByRole("button", { name: "Confirm Refund" })).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm Refund" }).click();

    await expect.poll(() => api.getLastRefundPayload()?.customAmount).toBe(50000);
    await expect(dialog.getByText("Refund completed")).toBeVisible();
    await expect(dialog.getByText("Refund confirmation email sent")).toBeVisible();
  });

  test("sorts by order reference and traverses cursor pagination with keyboard controls", async ({
    page,
  }) => {
    await mockAdminApis(page, { pageSize: 1 });

    await page.goto("/admin/orders", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Orders" }).first()).toBeVisible();

    if (!isMobileViewport(page)) {
      await page.getByRole("button", { name: "Order Ref" }).click();
      const table = page.getByRole("table");
      await expect(table.getByText("BP-2026-0001")).toBeVisible();
      await expect(table.getByText("BP-2026-0002")).toHaveCount(0);
    } else {
      await expect(page.locator("article").filter({ hasText: "BP-2026-0002" })).toHaveCount(1);
      await expect(page.locator("article").filter({ hasText: "BP-2026-0001" })).toHaveCount(0);
    }

    const nextButton = page.getByRole("button", { name: "Next", exact: true });
    await nextButton.focus();
    await page.keyboard.press("Enter");

    if (!isMobileViewport(page)) {
      const table = page.getByRole("table");
      await expect(table.getByText("BP-2026-0002")).toBeVisible();
      await expect(table.getByText("BP-2026-0001")).toHaveCount(0);
    } else {
      await expect(page.locator("article").filter({ hasText: "BP-2026-0001" })).toHaveCount(1);
      await expect(page.locator("article").filter({ hasText: "BP-2026-0002" })).toHaveCount(0);
    }

    const previousButton = page.getByRole("button", { name: "Previous", exact: true });
    await expect(previousButton).toBeEnabled();
    await previousButton.focus();
    await page.keyboard.press("Enter");

    if (!isMobileViewport(page)) {
      const table = page.getByRole("table");
      await expect(table.getByText("BP-2026-0001")).toBeVisible();
    } else {
      await expect(page.locator("article").filter({ hasText: "BP-2026-0002" })).toHaveCount(1);
    }
  });

  test("375px: mobile cards preserve keyboard focus, contrast, and overflow discipline", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAdminApis(page, { delayOrdersMs: 250 });

    await page.goto("/admin/orders", { waitUntil: "domcontentloaded" });
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeVisible();

    const firstOrderLink = page
      .locator("article")
      .first()
      .getByRole("link", { name: "View Order" });
    await tabUntilFocused(page, firstOrderLink, 24);
    await expect(firstOrderLink).toBeFocused();

    const actionColors = await firstOrderLink.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        foreground: styles.color,
        background: styles.backgroundColor,
      };
    });

    const ratio = contrastRatio(
      parseRgb(actionColors.foreground),
      parseRgb(actionColors.background)
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);

    const viewportWidth = page.viewportSize()?.width ?? 375;
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});

test.describe("Admin Users", () => {
  test("searches users, filters by role, and opens the detail workspace", async ({ page }) => {
    await mockAdminUserApis(page);

    await page.goto("/admin/users", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Users" }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("textbox", { name: "Search" }).fill("ada@example.com");
    await expect(page).toHaveURL(/q=ada%40example\.com/);

    await page.getByRole("combobox", { name: "Role" }).selectOption("EDITOR");
    await expect(page).toHaveURL(/role=EDITOR/);

    await page.getByRole("combobox", { name: "Verification" }).selectOption("true");
    await expect(page).toHaveURL(/isVerified=true/);

    if (isMobileViewport(page)) {
      const card = page.locator("article").filter({ hasText: "Ada Okafor" });
      await expect(card).toHaveCount(1);
      await expect(page.locator("article").filter({ hasText: "Grace Bello" })).toHaveCount(0);
      await expect(page.locator("article").filter({ hasText: "John Duru" })).toHaveCount(0);
      await card.getByRole("link", { name: /Manage User/ }).click();
    } else {
      const table = page.getByRole("table");
      const userRow = table.getByRole("row").filter({ hasText: "Ada Okafor" });
      await expect(userRow).toHaveCount(1);
      await expect(table.getByRole("row").filter({ hasText: "Grace Bello" })).toHaveCount(0);
      await expect(table.getByRole("row").filter({ hasText: "John Duru" })).toHaveCount(0);
      await userRow.getByRole("link", { name: /Manage User/ }).click();
    }

    await expect(page).toHaveURL(new RegExp(`/admin/users/${USER_ID}$`));
    await expect(page.getByRole("heading", { name: "Ada Okafor" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Order History" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
  });

  test("changes role and deactivates the account while surfacing audit trail updates", async ({
    page,
  }) => {
    const api = await mockAdminUserApis(page);

    await page.goto(`/admin/users/${USER_ID}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Ada Okafor" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Account Controls" })).toBeVisible();

    await page.getByRole("combobox", { name: "Role" }).selectOption("ADMIN");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect.poll(() => api.getLastUpdatePayload()?.role).toBe("ADMIN");
    await expect.poll(() => api.getLastAuditAction()).toBe("ADMIN_USER_ROLE_UPDATED");

    await expect(page.getByText("User updated", { exact: true })).toBeVisible();
    const latestAudit = page.locator('div[aria-live="polite"]').filter({
      hasText: "Latest Audit Entry",
    });
    await expect(latestAudit).toContainText("Latest Audit Entry");
    await expect(latestAudit).toContainText("Admin User Role Updated");
    await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue("ADMIN");

    const deactivateSwitch = page.getByRole("switch", { name: "Deactivate Account" });
    await deactivateSwitch.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Deactivate This Account" })).toBeVisible();
    await dialog.getByRole("button", { name: "Deactivate User" }).click();

    await expect.poll(() => api.getLastUpdatePayload()?.isActive).toBe(false);
    await expect.poll(() => api.getLastAuditAction()).toBe("ADMIN_USER_DEACTIVATED");

    await expect(page.getByText("User deactivated", { exact: true })).toBeVisible();
    await expect(latestAudit).toContainText("Admin User Deactivated");
    await expect(deactivateSwitch).toHaveAttribute("aria-checked", "true");
    await expect(deactivateSwitch).toBeDisabled();
    await expect(page.getByText("Inactive", { exact: true })).toBeVisible();
  });
});
