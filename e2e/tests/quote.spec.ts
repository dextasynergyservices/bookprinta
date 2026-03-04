import { expect, test } from "@playwright/test";

test.describe("Custom Quote", () => {
  test("shows estimator section on the standard (no special requirements) path", async ({
    page,
  }) => {
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    };

    await page.route("**/api/v1/quotes*", async (route) => {
      const { pathname } = new URL(route.request().url());
      const method = route.request().method();

      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }

      if (pathname.endsWith("/quotes/estimate")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            estimatedPriceLow: 120000,
            estimatedPriceHigh: 130000,
          }),
        });
        return;
      }

      if (pathname.endsWith("/quotes")) {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            id: "cmquote_test_123",
            status: "PENDING",
            message: "Custom quote submitted successfully.",
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto("/quote");
    await expect(page).toHaveTitle(/BookPrinta/);
    await expect(page.getByRole("heading", { name: "Get a Custom Quote" })).toBeVisible();

    const nextButton = page.getByRole("button", { name: "Next", exact: true });
    await expect(nextButton).toBeDisabled();

    await page.getByLabel("Working Title").fill("The Long Road Home");
    await page.getByLabel("Estimated Word Count").fill("24000");
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await page.getByRole("radio", { name: /A5/i }).click();
    await page.getByLabel("Quantity").fill("200");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("Estimated Cost")).toBeVisible();
    await expect(
      page.getByText("Our team will provide a custom price for your special requirements.")
    ).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  });

  test("skips estimator when special requirements are selected and submits null estimates", async ({
    page,
  }) => {
    let estimateCallCount = 0;
    let submitPayload: Record<string, unknown> | null = null;
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    };

    await page.route("**/api/v1/quotes*", async (route) => {
      const { pathname } = new URL(route.request().url());
      const method = route.request().method();

      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }

      if (pathname.endsWith("/quotes/estimate")) {
        estimateCallCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            estimatedPriceLow: 10000,
            estimatedPriceHigh: 20000,
          }),
        });
        return;
      }

      if (pathname.endsWith("/quotes")) {
        submitPayload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            id: "cmquote_test_456",
            status: "PENDING",
            message: "Custom quote submitted successfully.",
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto("/quote");
    await page.getByLabel("Working Title").fill("Special Edition Anthology");
    await page.getByLabel("Estimated Word Count").fill("12000");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("radio", { name: /A4/i }).click();
    await page.getByLabel("Quantity").fill("50");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.locator('label:has-text("I have special requirements")').click();
    await page.locator('label:has-text("Hard Back")').click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(
      page.getByText("Our team will provide a custom price for your special requirements.")
    ).toBeVisible();
    await expect(page.getByText("Estimated Cost")).not.toBeVisible();

    await page.getByLabel("Full Name").fill("Ada Writer");
    await page.getByLabel("Email Address").fill("ada@example.com");
    await page.getByLabel("Phone Number / WhatsApp").fill("+2348098765432");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Quote Submitted!" })).toBeVisible();
    expect(estimateCallCount).toBe(0);

    expect(submitPayload).not.toBeNull();
    expect(submitPayload).toMatchObject({
      workingTitle: "Special Edition Anthology",
      estimatedWordCount: 12000,
      bookSize: "A4",
      quantity: 50,
      hasSpecialReqs: true,
      specialRequirements: ["hardback"],
      estimatedPriceLow: null,
      estimatedPriceHigh: null,
    });
  });

  test("passes accessibility smoke checks at 375/768/1280", async ({ page }) => {
    const viewports = [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/quote");

      await expect(page.getByRole("heading", { name: "Get a Custom Quote" })).toBeVisible();
      await expect(page.getByLabel("Working Title")).toBeVisible();
      await expect(page.getByLabel("Estimated Word Count")).toBeVisible();

      await page.getByLabel("Working Title").fill("Viewport Accessibility");
      await page.getByLabel("Estimated Word Count").fill("1000");
      await page.getByRole("button", { name: "Next", exact: true }).click();

      const a4Radio = page.getByRole("radio", { name: /A4/i });
      await a4Radio.focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: /A5/i })).toHaveAttribute(
        "aria-checked",
        "true"
      );

      const audit = await page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll("h1")).find((node) =>
          (node.textContent || "").toLowerCase().includes("custom quote")
        );
        const scopeRoot = heading?.closest("section") ?? document.body;
        const controls = Array.from(
          scopeRoot.querySelectorAll("input, textarea, select, button")
        ).filter((node) => {
          const element = node as HTMLElement;
          if (node instanceof HTMLInputElement && node.type === "hidden") return false;
          if (element.hasAttribute("disabled")) return false;
          const style = window.getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        const missingAccessibleName = controls
          .filter((node) => {
            const element = node as HTMLElement;
            const ariaLabel = element.getAttribute("aria-label")?.trim();
            if (ariaLabel) return false;

            const labelledBy = element.getAttribute("aria-labelledby")?.trim();
            if (labelledBy) return false;

            if (node instanceof HTMLButtonElement && (node.textContent || "").trim().length > 0) {
              return false;
            }

            const id = element.id;
            if (id) {
              const linkedLabel = document.querySelector(`label[for="${id}"]`);
              if ((linkedLabel?.textContent || "").trim().length > 0) return false;
            }

            const wrappingLabel = element.closest("label");
            if ((wrappingLabel?.textContent || "").trim().length > 0) return false;

            return true;
          })
          .map((node) => {
            const element = node as HTMLElement;
            return `${node.tagName.toLowerCase()}#${element.id || "(no-id)"}`;
          });

        const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;

        return {
          missingAccessibleName,
          hasHorizontalOverflow,
        };
      });

      expect(audit.missingAccessibleName).toEqual([]);
      expect(audit.hasHorizontalOverflow).toBe(false);
    }
  });
});
