import { expect, type Page, test } from "@playwright/test";

const DEFAULT_ORIGIN = "http://localhost:3000";

type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  copies: number;
  sortOrder: number;
  isActive: boolean;
  packageCount: number;
  createdAt: string;
  updatedAt: string;
};

type AdminPackage = {
  id: string;
  categoryId: string;
  category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    copies: number;
    sortOrder: number;
    isActive: boolean;
  };
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  pageLimit: number;
  includesISBN: boolean;
  features: {
    items: string[];
    copies: {
      A4: number;
      A5: number;
      A6: number;
    };
  };
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminAddon = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricingType: "fixed" | "per_word";
  price: number | null;
  pricePerWord: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function buildCorsHeaders(pageOrigin?: string) {
  return {
    "access-control-allow-origin": pageOrigin ?? DEFAULT_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sortByOrderThenName<T extends { sortOrder: number; name: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

function createMockAccessToken() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "cmadmin000000000000000001",
      role: "SUPER_ADMIN",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");

  return `${header}.${payload}.mock-signature`;
}

async function seedAdminSession(page: Page) {
  await page.context().addCookies([
    {
      name: "access_token",
      value: createMockAccessToken(),
      url: "http://localhost:3000",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
}

async function mockAdminPackagesApis(page: Page) {
  let categories: AdminCategory[] = [
    {
      id: "cat-memoir",
      name: "Memoir",
      slug: "memoir",
      description: "Memoir packages",
      copies: 3,
      sortOrder: 2,
      isActive: true,
      packageCount: 1,
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    },
    {
      id: "cat-biz",
      name: "Business",
      slug: "business",
      description: "Business packages",
      copies: 2,
      sortOrder: 1,
      isActive: true,
      packageCount: 1,
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    },
  ];

  let packages: AdminPackage[] = [
    {
      id: "pkg-memoir",
      categoryId: "cat-memoir",
      category: {
        id: "cat-memoir",
        name: "Memoir",
        slug: "memoir",
        description: "Memoir packages",
        copies: 3,
        sortOrder: 2,
        isActive: true,
      },
      name: "Signature Memoir",
      slug: "signature-memoir",
      description: "Premium memoir package",
      basePrice: 85000,
      pageLimit: 200,
      includesISBN: true,
      features: {
        items: ["Interior formatting", "Cover design"],
        copies: { A4: 1, A5: 3, A6: 5 },
      },
      sortOrder: 2,
      isActive: true,
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    },
    {
      id: "pkg-biz",
      categoryId: "cat-biz",
      category: {
        id: "cat-biz",
        name: "Business",
        slug: "business",
        description: "Business packages",
        copies: 2,
        sortOrder: 1,
        isActive: true,
      },
      name: "Founder Legacy",
      slug: "founder-legacy",
      description: "Executive biography package",
      basePrice: 150000,
      pageLimit: 240,
      includesISBN: true,
      features: {
        items: ["Editorial review", "Priority production"],
        copies: { A4: 1, A5: 2, A6: 4 },
      },
      sortOrder: 1,
      isActive: true,
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    },
  ];

  let addons: AdminAddon[] = [
    {
      id: "addon-cover",
      name: "Cover Design",
      slug: "cover-design",
      description: "Professional cover design",
      pricingType: "fixed",
      price: 45000,
      pricePerWord: null,
      sortOrder: 2,
      isActive: true,
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    },
    {
      id: "addon-word-polish",
      name: "Word Polish",
      slug: "word-polish",
      description: "Per word polish",
      pricingType: "per_word",
      price: 0,
      pricePerWord: 0.3,
      sortOrder: 3,
      isActive: true,
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    },
  ];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    if (path.endsWith("/auth/me")) {
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
      return;
    }

    if (path.endsWith("/auth/refresh")) {
      await fulfillJson(page, route, {});
      return;
    }

    if (path.endsWith("/notifications/unread-count")) {
      await fulfillJson(page, route, { unreadCount: 0 });
      return;
    }

    if (path.endsWith("/admin/package-categories") && method === "GET") {
      await fulfillJson(page, route, sortByOrderThenName(categories));
      return;
    }

    if (path.endsWith("/admin/package-categories") && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      const copies = Number(body.copies);
      const sortOrder = Number(body.sortOrder);

      if (
        !name ||
        !Number.isFinite(copies) ||
        copies < 1 ||
        !Number.isFinite(sortOrder) ||
        sortOrder < 0
      ) {
        await fulfillJson(page, route, { message: "Validation failed" }, 400);
        return;
      }

      const created: AdminCategory = {
        id: `cat-${slugify(name)}-${Date.now()}`,
        name,
        slug: slugify(name),
        description: (body.description as string | null | undefined) ?? null,
        copies,
        sortOrder,
        isActive: body.isActive !== false,
        packageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      categories = sortByOrderThenName([...categories, created]);
      await fulfillJson(page, route, created, 201);
      return;
    }

    if (/\/admin\/package-categories\/[^/]+$/.test(path) && method === "PATCH") {
      const categoryId = path.split("/").pop() as string;
      const body = request.postDataJSON() as Record<string, unknown>;
      const current = categories.find((item) => item.id === categoryId);
      if (!current) {
        await fulfillJson(page, route, { message: "Package category not found" }, 404);
        return;
      }

      const next: AdminCategory = {
        ...current,
        name: body.name !== undefined ? String(body.name) : current.name,
        slug: body.name !== undefined ? slugify(String(body.name)) : current.slug,
        description:
          body.description !== undefined
            ? (body.description as string | null)
            : current.description,
        copies: body.copies !== undefined ? Number(body.copies) : current.copies,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : current.sortOrder,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : current.isActive,
        updatedAt: new Date().toISOString(),
      };

      categories = sortByOrderThenName(
        categories.map((item) => (item.id === categoryId ? next : item))
      );
      await fulfillJson(page, route, next);
      return;
    }

    if (/\/admin\/package-categories\/[^/]+$/.test(path) && method === "DELETE") {
      const categoryId = path.split("/").pop() as string;
      const current = categories.find((item) => item.id === categoryId);

      if (!current) {
        await fulfillJson(page, route, { message: "Package category not found" }, 404);
        return;
      }

      if (current.packageCount > 0) {
        await fulfillJson(
          page,
          route,
          { message: "Cannot delete category with assigned packages" },
          409
        );
        return;
      }

      categories = categories.filter((item) => item.id !== categoryId);
      await fulfillJson(page, route, { id: categoryId, deleted: true });
      return;
    }

    if (path.endsWith("/admin/packages") && method === "GET") {
      await fulfillJson(page, route, sortByOrderThenName(packages));
      return;
    }

    if (path.endsWith("/admin/packages") && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      const categoryId = String(body.categoryId ?? "");
      const category = categories.find((item) => item.id === categoryId);

      if (!name || !category) {
        await fulfillJson(page, route, { message: "Validation failed" }, 400);
        return;
      }

      const created: AdminPackage = {
        id: `pkg-${slugify(name)}-${Date.now()}`,
        categoryId,
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          copies: category.copies,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
        name,
        slug: slugify(name),
        description: (body.description as string | null | undefined) ?? null,
        basePrice: Number(body.basePrice ?? 0),
        pageLimit: Number(body.pageLimit ?? 1),
        includesISBN: Boolean(body.includesISBN),
        features: (body.features as AdminPackage["features"]) ?? {
          items: [],
          copies: { A4: 0, A5: 0, A6: 0 },
        },
        sortOrder: Number(body.sortOrder ?? 0),
        isActive: body.isActive !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      packages = sortByOrderThenName([...packages, created]);
      categories = categories.map((item) =>
        item.id === categoryId ? { ...item, packageCount: item.packageCount + 1 } : item
      );

      await fulfillJson(page, route, created, 201);
      return;
    }

    if (/\/admin\/packages\/[^/]+$/.test(path) && method === "PATCH") {
      const packageId = path.split("/").pop() as string;
      const body = request.postDataJSON() as Record<string, unknown>;
      const current = packages.find((item) => item.id === packageId);

      if (!current) {
        await fulfillJson(page, route, { message: "Package not found" }, 404);
        return;
      }

      const nextSortOrder =
        body.sortOrder !== undefined ? Number(body.sortOrder) : current.sortOrder;
      const next: AdminPackage = {
        ...current,
        sortOrder: nextSortOrder,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : current.isActive,
        name: body.name !== undefined ? String(body.name) : current.name,
        slug: body.name !== undefined ? slugify(String(body.name)) : current.slug,
        updatedAt: new Date().toISOString(),
      };

      packages = sortByOrderThenName(packages.map((item) => (item.id === packageId ? next : item)));
      await fulfillJson(page, route, next);
      return;
    }

    if (/\/admin\/packages\/[^/]+\/permanent$/.test(path) && method === "DELETE") {
      const segments = path.split("/");
      const packageId = segments[segments.length - 2] as string;
      const current = packages.find((item) => item.id === packageId);

      if (!current) {
        await fulfillJson(page, route, { message: "Package not found" }, 404);
        return;
      }

      packages = sortByOrderThenName(packages.filter((item) => item.id !== packageId));
      categories = categories.map((item) =>
        item.id === current.categoryId
          ? { ...item, packageCount: Math.max(0, item.packageCount - 1) }
          : item
      );

      await fulfillJson(page, route, { id: packageId, deleted: true });
      return;
    }

    if (path.endsWith("/admin/addons") && method === "GET") {
      await fulfillJson(page, route, sortByOrderThenName(addons));
      return;
    }

    if (path.endsWith("/admin/addons") && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const pricingType = String(body.pricingType ?? "") as "fixed" | "per_word";

      if (pricingType !== "fixed" && pricingType !== "per_word") {
        await fulfillJson(page, route, { message: "Invalid pricingType" }, 400);
        return;
      }

      if (
        pricingType === "fixed" &&
        (body.price === null || body.price === undefined || Number(body.price) < 0)
      ) {
        await fulfillJson(
          page,
          route,
          { message: "price is required when pricingType is fixed" },
          409
        );
        return;
      }

      if (
        pricingType === "per_word" &&
        (body.pricePerWord === null ||
          body.pricePerWord === undefined ||
          Number(body.pricePerWord) < 0)
      ) {
        await fulfillJson(
          page,
          route,
          { message: "pricePerWord is required when pricingType is per_word" },
          409
        );
        return;
      }

      const name = String(body.name ?? "").trim();
      if (!name) {
        await fulfillJson(page, route, { message: "Validation failed" }, 400);
        return;
      }

      const created: AdminAddon = {
        id: `addon-${slugify(name)}-${Date.now()}`,
        name,
        slug: slugify(name),
        description: (body.description as string | null | undefined) ?? null,
        pricingType,
        price: pricingType === "fixed" ? Number(body.price ?? 0) : 0,
        pricePerWord: pricingType === "per_word" ? Number(body.pricePerWord ?? 0) : null,
        sortOrder: Number(body.sortOrder ?? 0),
        isActive: body.isActive !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      addons = sortByOrderThenName([...addons, created]);
      await fulfillJson(page, route, created, 201);
      return;
    }

    if (/\/admin\/addons\/[^/]+$/.test(path) && method === "PATCH") {
      const addonId = path.split("/").pop() as string;
      const body = request.postDataJSON() as Record<string, unknown>;
      const current = addons.find((item) => item.id === addonId);

      if (!current) {
        await fulfillJson(page, route, { message: "Addon not found" }, 404);
        return;
      }

      const pricingType =
        body.pricingType !== undefined
          ? (String(body.pricingType) as "fixed" | "per_word")
          : current.pricingType;

      const next: AdminAddon = {
        ...current,
        pricingType,
        price:
          pricingType === "fixed"
            ? Number(body.price ?? current.price ?? 0)
            : Number(body.price ?? current.price ?? 0),
        pricePerWord:
          pricingType === "per_word"
            ? Number(body.pricePerWord ?? current.pricePerWord ?? 0)
            : null,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : current.sortOrder,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : current.isActive,
        updatedAt: new Date().toISOString(),
      };

      addons = sortByOrderThenName(addons.map((item) => (item.id === addonId ? next : item)));
      await fulfillJson(page, route, next);
      return;
    }

    if (/\/admin\/addons\/[^/]+$/.test(path) && method === "DELETE") {
      const addonId = path.split("/").pop() as string;
      const current = addons.find((item) => item.id === addonId);

      if (!current) {
        await fulfillJson(page, route, { message: "Addon not found" }, 404);
        return;
      }

      const next = {
        ...current,
        isActive: false,
        updatedAt: new Date().toISOString(),
      };

      addons = sortByOrderThenName(addons.map((item) => (item.id === addonId ? next : item)));
      await fulfillJson(page, route, next);
      return;
    }

    if (/\/admin\/addons\/[^/]+\/permanent$/.test(path) && method === "DELETE") {
      const segments = path.split("/");
      const addonId = segments[segments.length - 2] as string;
      const current = addons.find((item) => item.id === addonId);

      if (!current) {
        await fulfillJson(page, route, { message: "Addon not found" }, 404);
        return;
      }

      addons = sortByOrderThenName(addons.filter((item) => item.id !== addonId));
      await fulfillJson(page, route, { id: addonId, deleted: true });
      return;
    }

    await fulfillJson(page, route, {});
  });
}

test.describe("Admin Packages QA", () => {
  test("desktop: CRUD, toggles, ordering, and failure paths", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await mockAdminPackagesApis(page);
    await seedAdminSession(page);

    await page.goto("/admin/packages");

    await expect(page.getByRole("heading", { level: 1, name: "Packages" })).toBeVisible();

    await page
      .locator("section")
      .filter({ hasText: "Categories" })
      .getByRole("button", { name: "Create Category" })
      .click();
    await page.fill("#category-create-name:visible", "Poetry");
    await page.fill("#category-create-copies:visible", "10");
    await page.fill("#category-create-sort:visible", "0");
    await page.locator("button:visible", { hasText: "Create Category" }).first().click();
    await expect(page.getByText("Category created successfully.")).toBeVisible();

    const categoryRow = page.getByRole("row", { name: /Memoir/i }).first();
    await categoryRow.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.locator("#category-cat-memoir-sort:visible").fill("0");
    await page
      .locator("article", { has: page.locator("#category-cat-memoir-sort:visible") })
      .getByRole("button", { name: "Save Changes" })
      .click();
    await expect(page.getByText("Category updated successfully.")).toBeVisible();

    await categoryRow.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete Category" }).click();

    const categoryDeleteDialog = page.getByRole("alertdialog");
    await expect(
      categoryDeleteDialog.getByRole("heading", { name: "Confirm Permanent Deletion" })
    ).toBeVisible();
    await expect(categoryDeleteDialog.getByText("Target: Memoir")).toBeVisible();

    const categoryConfirmDeleteButton = categoryDeleteDialog.getByRole("button", {
      name: "Delete Permanently",
    });
    await expect(categoryConfirmDeleteButton).toBeDisabled();
    await page.fill("#packages-permanent-delete-confirm", "DELETE");
    await expect(categoryConfirmDeleteButton).toBeEnabled();
    await categoryConfirmDeleteButton.click();

    await expect(page.getByText("Cannot delete category")).toBeVisible();

    const addonRow = page.getByRole("row", { name: /Word Polish/i }).first();
    await addonRow.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.locator("#addon-addon-word-polish-sort-order:visible").fill("0");
    await page
      .locator("article", { has: page.locator("#addon-addon-word-polish-sort-order:visible") })
      .getByRole("button", { name: "Save Addon" })
      .click();
    await expect(page.getByText("Addon updated successfully.")).toBeVisible();

    const firstAddonRow = page.getByRole("row").filter({ hasText: "Word Polish" }).first();
    await expect(firstAddonRow).toContainText("0");

    const packageRow = page.getByRole("row", { name: /Signature Memoir/i }).first();
    await packageRow.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete Permanently" }).click();

    const permanentDeleteDialog = page.getByRole("alertdialog");
    await expect(
      permanentDeleteDialog.getByRole("heading", { name: "Confirm Permanent Deletion" })
    ).toBeVisible();
    await expect(permanentDeleteDialog.getByText("Target: Signature Memoir")).toBeVisible();

    const confirmDeleteButton = permanentDeleteDialog.getByRole("button", {
      name: "Delete Permanently",
    });
    await expect(confirmDeleteButton).toBeDisabled();

    await page.fill("#packages-permanent-delete-confirm", "delete");
    await expect(confirmDeleteButton).toBeDisabled();

    await page.fill("#packages-permanent-delete-confirm", "DELETE");
    await expect(confirmDeleteButton).toBeEnabled();
    await confirmDeleteButton.click();
    await expect(page.getByText("Package deleted permanently.")).toBeVisible();

    const addonPermanentDeleteRow = page.getByRole("row", { name: /Cover Design/i }).first();
    await addonPermanentDeleteRow.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete Permanently" }).click();

    await expect(
      permanentDeleteDialog.getByRole("heading", { name: "Confirm Permanent Deletion" })
    ).toBeVisible();
    await expect(permanentDeleteDialog.getByText("Target: Cover Design")).toBeVisible();

    await expect(confirmDeleteButton).toBeDisabled();
    await page.fill("#packages-permanent-delete-confirm", "DELETE");
    await expect(confirmDeleteButton).toBeEnabled();
    await confirmDeleteButton.click();
    await expect(page.getByText("Addon deleted permanently.")).toBeVisible();

    await addonRow.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Deactivate" }).click();
    await expect(page.getByText("Addon updated successfully.")).toBeVisible();

    await page.fill("#category-create-copies:visible", "");
    await page.locator("button:visible", { hasText: "Create Category" }).first().click();
    await expect(
      page.getByText("Please correct the highlighted fields and try again.")
    ).toBeVisible();

    await page
      .locator("section")
      .filter({ hasText: "Addons" })
      .getByRole("button", { name: "Create Addon" })
      .click();
    await page.locator("#addon-create-pricing-type:visible").click();
    await page.getByRole("option", { name: "Per Word" }).click();
    await page.fill("#addon-create-name:visible", "Line Edit");
    await page.fill("#addon-create-price-per-word:visible", "");
    await page.locator("button:visible", { hasText: "Create Addon" }).first().click();
    await expect(page.getByText("Price per word must be 0 or greater.")).toBeVisible();

    const invalidPricingStatus = await page.evaluate(async () => {
      const response = await fetch("http://localhost:3001/api/v1/admin/addons", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Invalid Pricing",
          pricingType: "invalid_type",
          sortOrder: 1,
        }),
      });

      return response.status;
    });

    expect(invalidPricingStatus).toBe(400);
  });

  test("mobile: create and toggle addon", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAdminPackagesApis(page);
    await seedAdminSession(page);

    await page.goto("/admin/packages");
    await expect(page.getByRole("heading", { level: 1, name: "Packages" })).toBeVisible();

    await page.getByRole("button", { name: "Addons" }).first().click();

    await page
      .locator("section")
      .filter({ hasText: "Addons" })
      .getByRole("button", { name: "Create Addon" })
      .click();

    await page.fill("#addon-create-name", "Mobile Addon");
    await page.fill("#addon-create-price", "12000");
    await page.fill("#addon-create-sort-order", "1");
    await page.getByRole("button", { name: "Create Addon" }).click();
    await expect(page.getByText("Addon created successfully.")).toBeVisible();

    await page.locator("#addon-addon-cover-active").click();
    await page
      .locator("article", { has: page.locator("#addon-addon-cover-active") })
      .getByRole("button", { name: "Save Addon" })
      .click();
    await expect(page.getByText("Addon updated successfully.")).toBeVisible();
  });
});
