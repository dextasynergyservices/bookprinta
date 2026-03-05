import { expect, test } from "@playwright/test";

type ResourceCategory = {
  id: string;
  name: string;
  slug: string;
  articleCount: number;
};

type ResourceListResponse = {
  items: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    category: { id: string; name: string; slug: string } | null;
  }>;
  hasMore: boolean;
  nextCursor: string | null;
};

const REQUIRED_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchCategories(
  page: Parameters<typeof test>[0]["page"]
): Promise<ResourceCategory[]> {
  const response = await page.request.get(`${getApiV1BaseUrl()}/resources/categories`);
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as { categories?: ResourceCategory[] };
  return data.categories ?? [];
}

async function fetchFirstResource(page: Parameters<typeof test>[0]["page"]) {
  const response = await page.request.get(`${getApiV1BaseUrl()}/resources?limit=1`);
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as ResourceListResponse;
  return data.items?.[0] ?? null;
}

test.describe("Resources marketing QA (live backend)", () => {
  test("mobile-first layout holds at 375/768/1280 with no horizontal overflow", async ({
    page,
  }) => {
    for (const viewport of REQUIRED_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/resources");

      await expect(page.getByRole("heading", { level: 1, name: /Resources/i })).toBeVisible();

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );
      expect(hasHorizontalOverflow).toBe(false);
    }
  });

  test("listing supports filtering, shareable URLs, metadata, and pagination", async ({ page }) => {
    const categories = await fetchCategories(page);
    const filterCandidate =
      categories.find((candidate) => candidate.articleCount > 0) ?? categories[0] ?? null;

    await page.goto("/resources");

    await expect(page.getByRole("heading", { level: 1, name: /Resources/i })).toBeVisible();
    await expect(page).toHaveTitle(/Resources/i);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^All/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    if (filterCandidate) {
      await page
        .getByRole("button", { name: new RegExp(escapeRegex(filterCandidate.name), "i") })
        .click();

      await expect(page).toHaveURL(new RegExp(`\\?category=${escapeRegex(filterCandidate.slug)}$`));
      await expect(
        page.locator('button[aria-pressed="true"]').filter({ hasText: filterCandidate.name })
      ).toBeVisible();

      const sharedUrl = page.url();
      const sharedPage = await page.context().newPage();
      await sharedPage.goto(sharedUrl);
      await expect(sharedPage).toHaveURL(
        new RegExp(`\\?category=${escapeRegex(filterCandidate.slug)}$`)
      );
      await sharedPage.close();
    }

    const loadMoreButton = page.getByRole("button", { name: /Load More/i });
    if ((await loadMoreButton.count()) > 0) {
      const cardsBefore = await page.locator("ul[aria-label] a", { hasText: /Read More/i }).count();
      await loadMoreButton.click();
      await page.waitForTimeout(250);
      const cardsAfter = await page.locator("ul[aria-label] a", { hasText: /Read More/i }).count();
      expect(cardsAfter).toBeGreaterThan(cardsBefore);
    }
  });

  test("listing cards animate on hover when cards exist", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/resources");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(200);

    const readMoreLinks = page.getByRole("link", { name: /Read More/i });
    if ((await readMoreLinks.count()) === 0) {
      return;
    }

    const firstCard = readMoreLinks.first().locator("xpath=ancestor::article[1]");
    await expect(firstCard).toBeVisible();

    const beforeTransform = await firstCard.evaluate(
      (element) => window.getComputedStyle(element).transform
    );
    await firstCard.hover();
    await page.waitForTimeout(180);
    const afterTransform = await firstCard.evaluate(
      (element) => window.getComputedStyle(element).transform
    );

    expect(beforeTransform).not.toBe(afterTransform);
    expect(afterTransform).not.toBe("none");
  });

  test("category route resolves a real slug and invalid slug returns not found", async ({
    page,
  }) => {
    const categories = await fetchCategories(page);
    const validCategory = categories[0] ?? null;

    if (validCategory) {
      const validResponse = await page.goto(`/resources/category/${validCategory.slug}`);
      expect(validResponse?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: new RegExp(escapeRegex(validCategory.name), "i"),
        })
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /Back to Resources/i })).toHaveAttribute(
        "href",
        "/resources"
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    } else {
      test.info().annotations.push({
        type: "note",
        description: "No categories returned by API; valid category-route checks skipped.",
      });
    }

    const invalidResponse = await page.goto("/resources/category/e2e-invalid-category-slug");
    expect(invalidResponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: /404/i })).toBeVisible();
  });

  test("article route renders metadata, json-ld, and invalid slug returns not found", async ({
    page,
  }) => {
    const invalidResponse = await page.goto("/resources/e2e-invalid-article-slug");
    expect(invalidResponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: /404/i })).toBeVisible();

    const article = await fetchFirstResource(page);

    if (!article) {
      test.info().annotations.push({
        type: "note",
        description: "No published articles returned by API; valid article-route checks skipped.",
      });
      return;
    }

    const validResponse = await page.goto(`/resources/${article.slug}`);
    expect(validResponse?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(escapeRegex(article.title), "i") })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to Resources/i })).toHaveAttribute(
      "href",
      "/resources"
    );
    await expect(page.getByRole("link", { name: /Start Publishing/i })).toHaveAttribute(
      "href",
      "/pricing"
    );

    await expect(page).toHaveTitle(new RegExp(escapeRegex(article.title)));
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);

    const jsonLdScripts = page.locator('script[type="application/ld+json"]');
    const scriptCount = await jsonLdScripts.count();
    let articleJsonLd: Record<string, unknown> | null = null;

    for (let index = 0; index < scriptCount; index += 1) {
      const raw = await jsonLdScripts.nth(index).textContent();
      if (!raw || !raw.includes('"@type":"Article"')) continue;
      articleJsonLd = JSON.parse(raw) as Record<string, unknown>;
      break;
    }

    expect(articleJsonLd).not.toBeNull();
    expect(articleJsonLd?.["@type"]).toBe("Article");
  });
});
