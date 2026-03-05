import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

const SECTION_HEADINGS = [
  "about-story-heading",
  "about-stats-heading",
  "about-values-heading",
  "about-team-heading",
  "about-cta-heading",
] as const;

test.describe("About Page QA", () => {
  test("passes responsive and interaction checks at 375/768/1280", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/about");

      await expect(
        page.getByRole("heading", { level: 1, name: /Publishing, Reimagined/i })
      ).toBeVisible();

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );
      expect(hasHorizontalOverflow).toBe(false);

      const heroHeight = await page
        .locator('section[aria-labelledby="about-hero-heading"]')
        .evaluate((element) => element.getBoundingClientRect().height);
      expect(heroHeight).toBeGreaterThanOrEqual(viewport.height * 0.9);

      for (const headingId of SECTION_HEADINGS) {
        const section = page.locator(`section[aria-labelledby="${headingId}"]`);
        await section.scrollIntoViewIfNeeded();
        await expect(section).toBeVisible();
      }

      const focusSection = page.locator('section[aria-labelledby="about-stats-heading"]');
      await expect(focusSection.getByText(/1000 Titles/i)).toBeVisible();
      await expect(focusSection.getByText(/1 Million Copies/i)).toBeVisible();

      const ctaSection = page.locator('section[aria-labelledby="about-cta-heading"]');
      const pricingHref = await ctaSection.getByRole("link").nth(0).getAttribute("href");
      const quoteHref = await ctaSection.getByRole("link").nth(1).getAttribute("href");
      expect(pricingHref).toBe("/pricing");
      expect(quoteHref).toBe("/quote");
    }
  });

  test("renders translated copy, metadata, JSON-LD, and localized CTA links per locale", async ({
    page,
  }) => {
    const localeCases = [
      {
        path: "/about",
        eyebrow: "Our Story",
        pricingHref: "/pricing",
        quoteHref: "/quote",
        title: "About BookPrinta — Publishing, Reimagined for Nigeria",
        metaDescriptionStartsWith: "Learn why BookPrinta exists",
      },
      {
        path: "/fr/about",
        eyebrow: "Notre histoire",
        pricingHref: "/fr/pricing",
        quoteHref: "/fr/quote",
        title: "À propos de BookPrinta — L'édition réinventée pour le Nigeria",
        metaDescriptionStartsWith: "Découvrez pourquoi BookPrinta existe",
      },
      {
        path: "/es/about",
        eyebrow: "Nuestra historia",
        pricingHref: "/es/pricing",
        quoteHref: "/es/quote",
        title: "Acerca de BookPrinta — Publicación reinventada para Nigeria",
        metaDescriptionStartsWith: "Descubre por qué existe BookPrinta",
      },
    ] as const;

    for (const localeCase of localeCases) {
      await page.goto(localeCase.path);

      await expect(page.getByText(localeCase.eyebrow, { exact: true })).toBeVisible();
      await expect(page).toHaveTitle(localeCase.title);

      const metaDescription = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(metaDescription).toContain(localeCase.metaDescriptionStartsWith);

      const ctaSection = page.locator('section[aria-labelledby="about-cta-heading"]');
      const pricingHref = await ctaSection.getByRole("link").nth(0).getAttribute("href");
      const quoteHref = await ctaSection.getByRole("link").nth(1).getAttribute("href");
      expect(pricingHref).toBe(localeCase.pricingHref);
      expect(quoteHref).toBe(localeCase.quoteHref);

      const jsonLdRaw = await page
        .locator('script[type="application/ld+json"]')
        .first()
        .textContent();
      expect(jsonLdRaw).toBeTruthy();

      const jsonLd = JSON.parse(jsonLdRaw || "{}") as Record<string, unknown>;
      expect(jsonLd["@type"]).toBe("Organization");
      expect(jsonLd.url).toBe("https://bookprinta.com");
    }
  });

  test("applies CTA hover scale animation on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/about");

    const ctaMotionWrapper = page
      .locator('section[aria-labelledby="about-cta-heading"] .mt-8 > div')
      .first();
    await ctaMotionWrapper.scrollIntoViewIfNeeded();

    const beforeTransform = await ctaMotionWrapper.evaluate(
      (element) => window.getComputedStyle(element).transform
    );

    await ctaMotionWrapper.hover();
    await page.waitForTimeout(180);

    const afterTransform = await ctaMotionWrapper.evaluate(
      (element) => window.getComputedStyle(element).transform
    );

    expect(beforeTransform).not.toBe(afterTransform);
    expect(afterTransform).not.toBe("none");
  });
});
