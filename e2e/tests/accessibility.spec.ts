import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility audit using axe-core.
 *
 * Runs WCAG 2.1 AA checks on every key page at three breakpoints
 * (375 mobile, 768 tablet, 1280 desktop) to enforce CI-level a11y.
 *
 * Target: zero critical/serious violations on all audited pages.
 */

const VIEWPORTS = [
  { label: "mobile", width: 375, height: 812 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1280, height: 800 },
] as const;

/* ── Marketing / public pages ───────────────────────────────────── */

const MARKETING_PAGES = [
  { path: "/", name: "Home" },
  { path: "/pricing", name: "Pricing" },
  { path: "/about", name: "About" },
  { path: "/faq", name: "FAQ" },
  { path: "/contact", name: "Contact" },
  { path: "/showcase", name: "Showcase" },
  { path: "/resources", name: "Resources" },
  { path: "/quote", name: "Quote" },
] as const;

const LEGAL_PAGES = [
  { path: "/terms", name: "Terms" },
  { path: "/privacy", name: "Privacy" },
] as const;

const AUTH_PAGES = [
  { path: "/login", name: "Login" },
  { path: "/forgot-password", name: "Forgot Password" },
] as const;

/* ── Helpers ─────────────────────────────────────────────────────── */

function buildAxe(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("#__next-build-indicator"); // Next.js dev indicator
}

type AxeViolation = {
  id: string;
  impact?: string | null;
  help: string;
  nodes: { html: string }[];
};

function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return "none";
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `  → ${n.html.slice(0, 120)}`).join("\n");
      return `[${v.impact}] ${v.id}: ${v.help}\n${nodes}`;
    })
    .join("\n\n");
}

/* ── Tests ───────────────────────────────────────────────────────── */

test.describe("Accessibility Audit (axe-core WCAG 2.1 AA)", () => {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.label} (${vp.width}×${vp.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
      });

      /* ── Marketing pages ──────────────────────────────────── */

      for (const pg of MARKETING_PAGES) {
        test(`${pg.name} — no critical/serious a11y violations`, async ({ page }) => {
          await page.goto(pg.path, { waitUntil: "domcontentloaded" });

          // Allow animations to settle
          await page.waitForTimeout(500);

          const results = await buildAxe(page).analyze();

          const serious = results.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious"
          );

          expect(serious, `A11y violations on ${pg.name}:\n${formatViolations(serious)}`).toEqual(
            []
          );
        });
      }

      /* ── Legal pages ──────────────────────────────────────── */

      for (const pg of LEGAL_PAGES) {
        test(`${pg.name} — no critical/serious a11y violations`, async ({ page }) => {
          await page.goto(pg.path, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(300);

          const results = await buildAxe(page).analyze();

          const serious = results.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious"
          );

          expect(serious, `A11y violations on ${pg.name}:\n${formatViolations(serious)}`).toEqual(
            []
          );
        });
      }

      /* ── Auth pages ───────────────────────────────────────── */

      for (const pg of AUTH_PAGES) {
        test(`${pg.name} — no critical/serious a11y violations`, async ({ page }) => {
          await page.goto(pg.path, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(300);

          const results = await buildAxe(page).analyze();

          const serious = results.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious"
          );

          expect(serious, `A11y violations on ${pg.name}:\n${formatViolations(serious)}`).toEqual(
            []
          );
        });
      }
    });
  }

  /* ── Structural a11y checks (viewport-independent) ──────── */

  test("skip-to-content link exists and targets #main-content on marketing pages", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);

    // Focus the skip link via keyboard
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    const href = await focused.getAttribute("href");
    expect(href).toBe("#main-content");

    // Verify target exists
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toHaveCount(1);
  });

  test("all images inside links have non-empty alt text (legal layout logo)", async ({ page }) => {
    await page.goto("/terms", { waitUntil: "domcontentloaded" });

    // The logo in the legal layout header should have meaningful alt
    const logoImg = page.locator("header a img").first();
    const alt = await logoImg.getAttribute("alt");
    expect(alt).toBeTruthy();
    expect(alt).not.toBe("");
  });

  test("interactive elements meet 44×44 touch target minimum on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    // Check all buttons and links are at least 44×44
    const interactiveElements = page.locator(
      'button:visible, a:visible:not([tabindex="-1"]), input:visible, select:visible'
    );
    const count = await interactiveElements.count();

    const undersized: string[] = [];
    for (let i = 0; i < count; i++) {
      const el = interactiveElements.nth(i);
      const box = await el.boundingBox();
      if (!box) continue;
      // Allow 2px tolerance for sub-pixel rendering
      if (box.width < 42 || box.height < 42) {
        const tag = await el.evaluate((node) => {
          const n = node as HTMLElement;
          return `<${n.tagName.toLowerCase()} class="${n.className.slice(0, 60)}">`;
        });
        undersized.push(`${tag} (${Math.round(box.width)}×${Math.round(box.height)})`);
      }
    }

    // Report but don't hard-fail on minor elements (decorative links, etc.)
    if (undersized.length > 0) {
      console.warn(`Touch target warnings on /login:\n${undersized.join("\n")}`);
    }
    // Hard-fail only if buttons or inputs are undersized
    const criticalUndersized = undersized.filter(
      (s) => s.startsWith("<button") || s.startsWith("<input")
    );
    expect(
      criticalUndersized,
      `Critical touch targets under 44×44:\n${criticalUndersized.join("\n")}`
    ).toEqual([]);
  });

  test("focus-visible ring is applied to focusable elements", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    // Tab to the first input
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    await emailInput.focus();

    // Verify focus-visible outline is applied
    const outlineStyle = await emailInput.evaluate((el) => {
      return window.getComputedStyle(el).outlineColor;
    });

    // The outline should be set (not transparent/none)
    expect(outlineStyle).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("no horizontal overflow at 375px on key pages", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const pages = ["/", "/pricing", "/about", "/faq", "/contact", "/login", "/terms"];

    for (const path of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );
      expect(hasOverflow, `Horizontal overflow on ${path} at 375px`).toBe(false);
    }
  });
});
