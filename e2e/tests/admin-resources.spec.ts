import { expect, type Page, test } from "@playwright/test";

const DEFAULT_ORIGIN = "http://localhost:3000";

type ResourceCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  articleCount: number;
};

type ResourceArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  categoryId: string | null;
  isPublished: boolean;
  coverImageUrl: string | null;
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

function createMockAccessToken() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "cm_admin_resources_01",
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

async function mockAdminResourcesApis(page: Page) {
  let categoryCounter = 1;
  let articleCounter = 1;

  const categories: ResourceCategory[] = [];
  const articles: ResourceArticle[] = [];

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
          id: "cm_admin_resources_01",
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
        id: "cm_admin_resources_01",
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

    if (path === "/api/v1/admin/resource-categories" && method === "GET") {
      await fulfillJson(page, route, { categories });
      return;
    }

    if (path === "/api/v1/admin/resource-categories" && method === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        name: string;
        slug: string;
        description?: string | null;
        sortOrder: number;
        isActive: boolean;
      };

      const nextCategory: ResourceCategory = {
        id: `cat-${categoryCounter}`,
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
        articleCount: 0,
      };
      categoryCounter += 1;
      categories.push(nextCategory);

      await fulfillJson(page, route, nextCategory, 201);
      return;
    }

    if (/^\/api\/v1\/admin\/resource-categories\/[^/]+$/.test(path) && method === "PATCH") {
      const categoryId = path.split("/").pop() as string;
      const body = JSON.parse(request.postData() ?? "{}") as Partial<ResourceCategory>;
      const existing = categories.find((entry) => entry.id === categoryId);
      if (!existing) {
        await fulfillJson(page, route, { message: "Category not found" }, 404);
        return;
      }

      Object.assign(existing, {
        ...body,
        articleCount: existing.articleCount,
      });
      await fulfillJson(page, route, existing);
      return;
    }

    if (/^\/api\/v1\/admin\/resource-categories\/[^/]+$/.test(path) && method === "DELETE") {
      const categoryId = path.split("/").pop() as string;
      const hasArticles = articles.some((entry) => entry.categoryId === categoryId);
      if (hasArticles) {
        await fulfillJson(page, route, { message: "Category has assigned articles" }, 400);
        return;
      }

      const index = categories.findIndex((entry) => entry.id === categoryId);
      if (index >= 0) {
        categories.splice(index, 1);
      }
      await fulfillJson(page, route, { id: categoryId, deleted: true });
      return;
    }

    if (path === "/api/v1/admin/resources" && method === "GET") {
      const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
      const categoryId = url.searchParams.get("categoryId")?.trim() ?? "";
      const isPublished = url.searchParams.get("isPublished");

      const items = articles
        .filter((entry) => {
          const matchesQ =
            q.length === 0 ||
            entry.title.toLowerCase().includes(q) ||
            entry.slug.toLowerCase().includes(q);
          const matchesCategory = categoryId.length === 0 || entry.categoryId === categoryId;
          const matchesPublished =
            isPublished === null || String(entry.isPublished) === isPublished;

          return matchesQ && matchesCategory && matchesPublished;
        })
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          slug: entry.slug,
          excerpt: entry.excerpt,
          category: entry.categoryId
            ? (() => {
                const found = categories.find((candidate) => candidate.id === entry.categoryId);
                if (!found) return null;
                return { id: found.id, name: found.name, slug: found.slug };
              })()
            : null,
          isPublished: entry.isPublished,
          updatedAt: entry.updatedAt,
        }));

      await fulfillJson(page, route, {
        items,
        nextCursor: null,
        hasMore: false,
      });
      return;
    }

    if (path === "/api/v1/admin/resources" && method === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        title: string;
        slug: string;
        excerpt?: string | null;
        content: string;
        categoryId?: string | null;
        isPublished: boolean;
        coverImageUrl?: string | null;
      };

      const nextArticle: ResourceArticle = {
        id: `article-${articleCounter}`,
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt ?? null,
        content: body.content,
        categoryId: body.categoryId ?? null,
        isPublished: body.isPublished,
        coverImageUrl: body.coverImageUrl ?? null,
        updatedAt: new Date().toISOString(),
      };
      articleCounter += 1;
      articles.push(nextArticle);

      if (nextArticle.categoryId) {
        const category = categories.find((entry) => entry.id === nextArticle.categoryId);
        if (category) {
          category.articleCount += 1;
        }
      }

      await fulfillJson(
        page,
        route,
        {
          ...nextArticle,
          category: nextArticle.categoryId
            ? (categories
                .filter((entry) => entry.id === nextArticle.categoryId)
                .map((entry) => ({ id: entry.id, name: entry.name, slug: entry.slug }))[0] ?? null)
            : null,
        },
        201
      );
      return;
    }

    if (/^\/api\/v1\/admin\/resources\/slug-availability$/.test(path) && method === "GET") {
      const slug = url.searchParams.get("slug") ?? "";
      const excludeId = url.searchParams.get("excludeId") ?? "";
      const inUse = articles.some((entry) => entry.slug === slug && entry.id !== excludeId);
      await fulfillJson(page, route, { slug, isAvailable: !inUse });
      return;
    }

    if (/^\/api\/v1\/admin\/resources\/[^/]+$/.test(path) && method === "GET") {
      const resourceId = path.split("/").pop() as string;
      const article = articles.find((entry) => entry.id === resourceId);
      if (!article) {
        await fulfillJson(page, route, { message: "Resource not found" }, 404);
        return;
      }

      await fulfillJson(page, route, {
        ...article,
        category: article.categoryId
          ? (categories
              .filter((entry) => entry.id === article.categoryId)
              .map((entry) => ({ id: entry.id, name: entry.name, slug: entry.slug }))[0] ?? null)
          : null,
      });
      return;
    }

    if (/^\/api\/v1\/admin\/resources\/[^/]+$/.test(path) && method === "PATCH") {
      const resourceId = path.split("/").pop() as string;
      const body = JSON.parse(request.postData() ?? "{}") as Partial<ResourceArticle>;
      const article = articles.find((entry) => entry.id === resourceId);
      if (!article) {
        await fulfillJson(page, route, { message: "Resource not found" }, 404);
        return;
      }

      Object.assign(article, {
        ...body,
        updatedAt: new Date().toISOString(),
      });

      await fulfillJson(page, route, {
        ...article,
        category: article.categoryId
          ? (categories
              .filter((entry) => entry.id === article.categoryId)
              .map((entry) => ({ id: entry.id, name: entry.name, slug: entry.slug }))[0] ?? null)
          : null,
      });
      return;
    }

    if (/^\/api\/v1\/admin\/resources\/[^/]+$/.test(path) && method === "DELETE") {
      const resourceId = path.split("/").pop() as string;
      const index = articles.findIndex((entry) => entry.id === resourceId);
      const article = index >= 0 ? articles[index] : null;
      if (!article) {
        await fulfillJson(page, route, { message: "Resource not found" }, 404);
        return;
      }

      if (article.categoryId) {
        const category = categories.find((entry) => entry.id === article.categoryId);
        if (category && category.articleCount > 0) {
          category.articleCount -= 1;
        }
      }

      articles.splice(index, 1);
      await fulfillJson(page, route, { id: resourceId, deleted: true });
      return;
    }

    await route.continue();
  });
}

test.describe("Admin Resources QA", () => {
  test("supports category/article CRUD plus preview link behavior", async ({ page }) => {
    await seedAdminSession(page);
    await mockAdminResourcesApis(page);

    await page.goto("/admin/resources", { waitUntil: "domcontentloaded" });

    await page.getByLabel("Category Name").fill("Publishing Guides");
    await page.getByLabel("Category Slug").fill("publishing-guides");
    await page.getByLabel("Sort Order").fill("1");
    await page.getByRole("button", { name: "Create Category" }).click();

    await expect(page.getByText("Publishing Guides")).toBeVisible();

    await page.getByLabel("Title").fill("The Editing Checklist");
    await page.getByLabel("Article Slug").fill("the-editing-checklist");
    await page.getByLabel("Content").fill("## First pass\n- Tighten structure");
    await page.getByRole("button", { name: "Create Article" }).click();

    await expect(page.getByText("The Editing Checklist")).toBeVisible();

    const actionButtons = page.getByRole("button", { name: "Open article actions" });
    await actionButtons.first().click();

    const previewPopup = page.waitForEvent("popup");
    await page.getByRole("menuitem", { name: "Preview" }).click();
    const popup = await previewPopup;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toContain("/resources/the-editing-checklist");
    await popup.close();

    await actionButtons.first().click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Title").fill("The Editing Checklist v2");
    await editDialog.getByRole("button", { name: "Save Article" }).click();

    await expect(page.getByText("The Editing Checklist v2")).toBeVisible();

    await actionButtons.first().click();
    await page.getByRole("menuitem", { name: "Publish" }).click();
    await expect(page.getByText("Published")).toBeVisible();

    await actionButtons.first().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("The Editing Checklist v2")).not.toBeVisible();

    await page.getByRole("button", { name: "Delete Category" }).click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Publishing Guides")).not.toBeVisible();
  });
});
