import { expect, type Page, test } from "@playwright/test";

const DEFAULT_ORIGIN = "http://localhost:3000";

type AdminShowcaseCategory = {
  id: string;
  name: string;
};

type AdminShowcaseUser = {
  id: string;
  displayName: string;
  email: string;
  profileComplete: boolean;
};

type AdminShowcaseEntry = {
  id: string;
  authorName: string;
  bookTitle: string;
  bookCoverUrl: string;
  aboutBook: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  publishedYear: number | null;
  userId: string | null;
  user: AdminShowcaseUser | null;
  isFeatured: boolean;
  sortOrder: number;
  previewPath: string;
  createdAt: string;
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

function createMockAccessToken() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "cm_admin_showcase_01",
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

async function mockAdminShowcaseApis(page: Page) {
  const categories: AdminShowcaseCategory[] = [{ id: "cat-fiction", name: "Fiction" }];
  const users: AdminShowcaseUser[] = [
    {
      id: "user-ada",
      displayName: "Ada User",
      email: "ada@example.com",
      profileComplete: true,
    },
  ];

  let entries: AdminShowcaseEntry[] = [];
  let createdCount = 0;

  await page.route("**/api.v1/**", async (route) => {
    await route.continue();
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === "OPTIONS") {
      await fulfillPreflight(page, route);
      return;
    }

    if (path === "/api/v1/auth/me" && method === "GET") {
      await fulfillJson(page, route, {
        user: {
          id: "cm_admin_showcase_01",
          email: "admin@bookprinta.com",
          role: "SUPER_ADMIN",
          firstName: "Admin",
          lastName: "User",
          displayName: "Admin User",
          isVerified: true,
        },
      });
      return;
    }

    if (path === "/api/v1/users/me" && method === "GET") {
      await fulfillJson(page, route, {
        id: "cm_admin_showcase_01",
        email: "admin@bookprinta.com",
        firstName: "Admin",
        lastName: "User",
        role: "SUPER_ADMIN",
        isVerified: true,
      });
      return;
    }

    if (path === "/api/v1/notifications/unread-count" && method === "GET") {
      await fulfillJson(page, route, { count: 0 });
      return;
    }

    if (path === "/api/v1/admin/showcase-categories" && method === "GET") {
      await fulfillJson(page, route, {
        categories,
      });
      return;
    }

    if (path === "/api/v1/admin/showcase" && method === "GET") {
      const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
      const categoryId = url.searchParams.get("categoryId") ?? "";

      const filtered = entries.filter((entry) => {
        const matchesQ =
          q.length === 0 ||
          entry.bookTitle.toLowerCase().includes(q) ||
          entry.authorName.toLowerCase().includes(q);
        const matchesCategory = categoryId.length === 0 || entry.categoryId === categoryId;
        return matchesQ && matchesCategory;
      });

      await fulfillJson(page, route, {
        items: filtered,
        nextCursor: null,
        hasMore: false,
      });
      return;
    }

    if (path === "/api/v1/admin/showcase/users/search" && method === "GET") {
      const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
      const filtered = users.filter(
        (user) =>
          q.length === 0 ||
          user.displayName.toLowerCase().includes(q) ||
          user.email.toLowerCase().includes(q)
      );

      await fulfillJson(page, route, {
        items: filtered,
        nextCursor: null,
        hasMore: false,
      });
      return;
    }

    if (path === "/api/v1/admin/showcase" && method === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        authorName: string;
        bookTitle: string;
        coverImageUrl: string;
        aboutBook?: string | null;
        categoryId?: string | null;
        userId?: string | null;
        publishedYear?: number | null;
        isFeatured?: boolean;
        sortOrder?: number;
      };

      createdCount += 1;
      const id = `entry-${createdCount}`;
      const linkedUser = users.find((user) => user.id === body.userId) ?? null;
      const category = categories.find((item) => item.id === body.categoryId) ?? null;

      const entry: AdminShowcaseEntry = {
        id,
        authorName: body.authorName,
        bookTitle: body.bookTitle,
        bookCoverUrl: body.coverImageUrl,
        aboutBook: body.aboutBook ?? null,
        categoryId: body.categoryId ?? null,
        category: category ? { id: category.id, name: category.name } : null,
        publishedYear: body.publishedYear ?? null,
        userId: linkedUser?.id ?? null,
        user: linkedUser,
        isFeatured: body.isFeatured ?? true,
        sortOrder: body.sortOrder ?? 0,
        previewPath: `/showcase?entry=${id}`,
        createdAt: new Date().toISOString(),
      };

      entries = [entry, ...entries];
      await fulfillJson(page, route, entry, 201);
      return;
    }

    if (/^\/api\/v1\/admin\/showcase\/[^/]+$/.test(path) && method === "PATCH") {
      const entryId = path.split("/").pop() as string;
      const body = JSON.parse(request.postData() ?? "{}") as Partial<AdminShowcaseEntry> & {
        coverImageUrl?: string;
      };

      const current = entries.find((entry) => entry.id === entryId);
      if (!current) {
        await fulfillJson(page, route, { message: "Showcase entry not found" }, 404);
        return;
      }

      const category = body.categoryId
        ? (categories.find((item) => item.id === body.categoryId) ?? null)
        : current.category;

      const linkedUser = body.userId
        ? (users.find((user) => user.id === body.userId) ?? null)
        : body.userId === null
          ? null
          : current.user;

      const updated: AdminShowcaseEntry = {
        ...current,
        ...(body.authorName !== undefined ? { authorName: body.authorName } : {}),
        ...(body.bookTitle !== undefined ? { bookTitle: body.bookTitle } : {}),
        ...(body.coverImageUrl !== undefined ? { bookCoverUrl: body.coverImageUrl } : {}),
        ...(body.aboutBook !== undefined ? { aboutBook: body.aboutBook } : {}),
        ...(body.categoryId !== undefined
          ? {
              categoryId: body.categoryId,
              category: category ? { id: category.id, name: category.name } : null,
            }
          : {}),
        ...(body.publishedYear !== undefined ? { publishedYear: body.publishedYear } : {}),
        ...(body.userId !== undefined ? { userId: body.userId, user: linkedUser } : {}),
        ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      };

      entries = entries.map((entry) => (entry.id === entryId ? updated : entry));
      await fulfillJson(page, route, updated);
      return;
    }

    if (/^\/api\/v1\/admin\/showcase\/[^/]+$/.test(path) && method === "DELETE") {
      const entryId = path.split("/").pop() as string;
      entries = entries.filter((entry) => entry.id !== entryId);
      await fulfillJson(page, route, { id: entryId, deleted: true });
      return;
    }

    if (path === "/api/v1/admin/showcase/cover-upload" && method === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        action: "authorize" | "finalize";
        secureUrl?: string;
        publicId?: string;
        entryId?: string;
      };

      if (body.action === "authorize") {
        await fulfillJson(page, route, {
          action: "authorize",
          upload: {
            signature: "mock-signature",
            timestamp: 1710000000,
            cloudName: "demo",
            apiKey: "mock-api-key",
            folder: "bookprinta/showcase/covers",
            resourceType: "image",
            publicId: "cover-cm_admin_showcase_01-mock",
            tags: ["bookprinta", "source:admin-showcase-cover"],
          },
        });
        return;
      }

      if (!body.secureUrl || !body.publicId) {
        await fulfillJson(page, route, { message: "Invalid finalize payload" }, 400);
        return;
      }

      if (body.entryId) {
        entries = entries.map((entry) =>
          entry.id === body.entryId ? { ...entry, bookCoverUrl: body.secureUrl as string } : entry
        );
      }

      await fulfillJson(page, route, {
        action: "finalize",
        secureUrl: body.secureUrl,
        publicId: body.publicId,
      });
      return;
    }

    await route.continue();
  });

  await page.route("https://api.cloudinary.com/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        secure_url:
          "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/covers/cover-cm_admin_showcase_01-mock.jpg",
        public_id: "bookprinta/showcase/covers/cover-cm_admin_showcase_01-mock",
      }),
    });
  });
}

test.describe("Admin Showcase QA", () => {
  test("desktop: create, edit, toggle, and delete showcase entry", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await mockAdminShowcaseApis(page);
    await seedAdminSession(page);

    await page.goto("/admin/showcase");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { level: 1, name: "Showcase" })).toBeVisible();

    await page.fill('input[aria-label="Linked User"]', "Ada");
    await expect(page.getByRole("button", { name: /Ada User/i })).toBeVisible();
    await page.getByRole("button", { name: /Ada User/i }).click();

    const coverInput = page.locator('input[type="file"]').first();
    await coverInput.setInputFiles({
      name: "cover.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([1, 2, 3, 4, 5]),
    });

    await page.getByRole("button", { name: "Upload Cover" }).click();
    await expect(
      page.getByRole("progressbar", { name: "Showcase cover upload progress" })
    ).toBeVisible();
    await expect(page.getByText("Cover uploaded successfully.")).toBeVisible();

    await page.fill('input[aria-label="Author Name"]', "A. Author");
    await page.fill('input[aria-label="Book Title"]', "My Story");

    await page.getByRole("button", { name: "Create Entry" }).click();
    await expect(page.getByText("Showcase entry created successfully.").first()).toBeVisible();
    await expect(page.locator("article", { hasText: "My Story" })).toHaveCount(1);

    const createdRow = page.locator("article", { hasText: "My Story" }).first();
    await createdRow.getByRole("button", { name: "Edit Showcase Entry" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Author Name").fill("Edited Author");
    await editDialog.getByRole("button", { name: "Save Entry" }).click();
    await expect(page.getByText("Showcase entry updated successfully.").first()).toBeVisible();

    await createdRow.getByRole("switch", { name: "Featured on homepage" }).click();
    await expect(page.getByText("Showcase entry updated successfully.").first()).toBeVisible();

    await createdRow.getByRole("button", { name: "Delete Entry" }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Showcase entry deleted successfully.").first()).toBeVisible();
    await expect(page.getByText("My Story")).toHaveCount(0);
  });
});
