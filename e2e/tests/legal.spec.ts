import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

const LEGAL_PAGES = [
  {
    path: "/terms",
    title: "Terms & Conditions",
    firstSection: "acceptance",
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    firstSection: "data_collected",
  },
] as const;

test.describe("Legal pages QA", () => {
  test("remain readable and stable at 375, 768, and 1280", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const legalPage of LEGAL_PAGES) {
        await page.goto(legalPage.path);

        const heading = page.getByRole("heading", { level: 1, name: legalPage.title });
        await expect(heading).toBeVisible();
        await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();
        await expect(page.locator("footer")).toHaveCount(0);

        const hasHorizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1
        );
        expect(hasHorizontalOverflow).toBe(false);

        const headingBox = await heading.boundingBox();
        expect(headingBox?.height ?? 0).toBeLessThanOrEqual(viewport.width === 375 ? 180 : 140);

        const headerHeight = await page
          .locator("header")
          .first()
          .evaluate((element) => element.getBoundingClientRect().height);
        expect(headerHeight).toBeLessThan(112);

        const firstBodyParagraph = page.locator('[data-legal-section-body="true"] p').first();
        const firstBodyType = await firstBodyParagraph.evaluate((element) => {
          const styles = window.getComputedStyle(element);
          return {
            fontSize: Number.parseFloat(styles.fontSize),
            lineHeight: Number.parseFloat(styles.lineHeight),
          };
        });

        expect(firstBodyType.fontSize).toBeGreaterThanOrEqual(16);
        expect(firstBodyType.lineHeight).toBeGreaterThanOrEqual(28);

        const firstSection = page.locator(`section[aria-labelledby="${legalPage.firstSection}"]`);
        await firstSection.scrollIntoViewIfNeeded();
        await expect(firstSection).toBeVisible();

        const firstSectionSpacing = await firstSection.evaluate((element) => {
          const styles = window.getComputedStyle(element);
          return {
            paddingTop: Number.parseFloat(styles.paddingTop),
            paddingBottom: Number.parseFloat(styles.paddingBottom),
          };
        });

        expect(firstSectionSpacing.paddingTop).toBeGreaterThanOrEqual(28);
        expect(firstSectionSpacing.paddingBottom).toBeGreaterThanOrEqual(28);
      }
    }
  });

  test("keeps skip links, heading hierarchy, metadata, and footer entry points working", async ({
    page,
  }) => {
    await page.goto("/terms");

    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator("h2").count()).toBeGreaterThan(0);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

    await page.goto("/terms");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Back to Home" })).toBeFocused();

    await expect(page).toHaveTitle("Terms & Conditions - BookPrinta");

    const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonicalHref).toContain("/terms");

    const frenchAlternateHref = await page
      .locator('link[rel="alternate"][hreflang="fr"]')
      .getAttribute("href");
    expect(frenchAlternateHref).toContain("/fr/terms");

    await expect(page.locator('meta[name="robots"][content*="noindex" i]')).toHaveCount(0);

    await page.goto("/fr/privacy");
    await expect(page).toHaveTitle("Politique de confidentialité - BookPrinta");

    const privacyCanonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(privacyCanonicalHref).toContain("/fr/privacy");

    await page.goto("/about");
    const aboutFooter = page.locator("footer").last();
    await aboutFooter.scrollIntoViewIfNeeded();
    await aboutFooter.locator('a[href$="/terms"]').click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(0);

    await page.goto("/about");
    await aboutFooter.scrollIntoViewIfNeeded();
    await aboutFooter.locator('a[href$="/privacy"]').click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(0);
  });
});
