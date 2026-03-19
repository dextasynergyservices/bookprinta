import { chromium } from "@playwright/test";

const WEB_BASE_URL = process.env.PWA_WEB_BASE_URL;
const VERCEL_BYPASS_TOKEN = process.env.PWA_VERCEL_BYPASS_TOKEN || "";
const OFFLINE_MARKETING_PATH = process.env.PWA_OFFLINE_MARKETING_PATH || "/fr/about";
const OFFLINE_FALLBACK_PATH =
  process.env.PWA_OFFLINE_FALLBACK_PATH || "/fr/pwa-deployed-offline-miss";
const EXPECT_UPDATE = process.env.PWA_EXPECT_UPDATE === "true";
const UPDATE_TIMEOUT_MS = Number(process.env.PWA_UPDATE_TIMEOUT_MS || 180000);
const UPDATE_POLL_INTERVAL_MS = Number(process.env.PWA_UPDATE_POLL_INTERVAL_MS || 5000);
const FRENCH_OFFLINE_PAGE_DESCRIPTION = "verifiez votre connexion et reessayez.";
const FRENCH_OFFLINE_HEADING = "vous etes hors ligne";
const FRENCH_MARKETING_MARKERS = [
  "notre histoire",
  "l'edition, reinventee",
  "l'edition, reinvente",
  "l'edition, reimagined",
];
const ENGLISH_UPDATE_TITLE = "Update available";
const ENGLISH_RELOAD_LABEL = "Reload";
let latestReport = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeBaseUrl(baseUrl) {
  assert(baseUrl, "Set PWA_WEB_BASE_URL to the deployed HTTPS origin you want to validate.");

  const normalized = baseUrl.replace(/\/+$/, "");
  const parsed = new URL(normalized);

  assert(parsed.protocol === "https:", "PWA_WEB_BASE_URL must use HTTPS for deployed validation.");
  return normalized;
}

function buildUrl(baseUrl, pathname = "/", includeBypass = false) {
  const url = new URL(pathname, `${baseUrl}/`);

  if (includeBypass && VERCEL_BYPASS_TOKEN) {
    url.searchParams.set("x-vercel-set-bypass-cookie", "true");
    url.searchParams.set("x-vercel-protection-bypass", VERCEL_BYPASS_TOKEN);
  }

  return url.toString();
}

function normalizeForMatch(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function readVisibleBodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function navigateWithBypass(page, baseUrl, pathname, waitUntil = "networkidle") {
  const response = await page.goto(buildUrl(baseUrl, pathname, true), { waitUntil });

  if (response?.status() === 401 && !VERCEL_BYPASS_TOKEN) {
    throw new Error(
      "The deployed preview is protected by Vercel authentication. Set PWA_VERCEL_BYPASS_TOKEN and retry."
    );
  }

  if (response?.status() === 401 && VERCEL_BYPASS_TOKEN) {
    throw new Error(
      "The deployed preview still returned 401 after applying PWA_VERCEL_BYPASS_TOKEN."
    );
  }

  const title = await page.title();
  const bodyText = await readVisibleBodyText(page);

  if (
    title.includes("Authentication Required") ||
    bodyText.includes("This page requires Vercel authentication")
  ) {
    throw new Error(
      "The deployed preview is still behind Vercel authentication. Confirm PWA_VERCEL_BYPASS_TOKEN is correct."
    );
  }

  return response;
}

async function ensureServiceWorkerControl(page, baseUrl) {
  await navigateWithBypass(page, baseUrl, "/about");
  await page.evaluate(() => navigator.serviceWorker.ready);

  let hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!hasController) {
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  }

  assert(hasController, "Expected the deployed page to be controlled by the service worker.");
}

async function readCacheSnapshot(page) {
  return page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const cachesByName = {};

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      cachesByName[cacheName] = requests.map((request) => {
        const url = new URL(request.url);
        return `${url.pathname}${url.search}`;
      });
    }

    return {
      cacheNames,
      cachesByName,
    };
  });
}

function findCacheEntries(snapshot, cacheNameFragment) {
  const cacheName = snapshot.cacheNames.find((name) => name.includes(cacheNameFragment));
  if (!cacheName) {
    return { cacheName: null, entries: [] };
  }

  return {
    cacheName,
    entries: snapshot.cachesByName[cacheName] ?? [],
  };
}

async function verifyUpdatePrompt(page) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < UPDATE_TIMEOUT_MS) {
    await page.reload({ waitUntil: "networkidle" });

    const prompt = page.getByText(ENGLISH_UPDATE_TITLE, { exact: true });
    if (await prompt.isVisible().catch(() => false)) {
      const reloadButton = page.getByRole("button", { name: ENGLISH_RELOAD_LABEL });
      assert(
        await reloadButton.isVisible().catch(() => false),
        "Update prompt appeared without a visible reload action."
      );

      await reloadButton.click();
      await page.waitForLoadState("networkidle");

      return {
        verified: true,
        promptAppeared: true,
        reloadClicked: true,
        observedAfterMs: Date.now() - startedAt,
      };
    }

    await page.waitForTimeout(UPDATE_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${UPDATE_TIMEOUT_MS}ms waiting for the deployed service-worker update prompt.`
  );
}

async function main() {
  const baseUrl = normalizeBaseUrl(WEB_BASE_URL);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  const report = {
    checkedAt: new Date().toISOString(),
    webBaseUrl: baseUrl,
    usedVercelBypassToken: Boolean(VERCEL_BYPASS_TOKEN),
    manifest: null,
    serviceWorker: null,
    caches: null,
    marketingOffline: null,
    uncachedFallback: null,
    updatePrompt: null,
  };
  latestReport = report;

  try {
    await navigateWithBypass(page, baseUrl, "/");
    await ensureServiceWorkerControl(page, baseUrl);

    const cdp = await context.newCDPSession(page);
    const manifestResult = await cdp.send("Page.getAppManifest");
    const swResponse = await context.request.get(buildUrl(baseUrl, "/sw.js", true));
    const swText = await swResponse.text();
    const manifestData = manifestResult.data ?? "";

    report.manifest = {
      url: manifestResult.url,
      errors: manifestResult.errors,
      hasManifest: Boolean(manifestData),
      containsStandaloneDisplay: manifestData.includes('"display":"standalone"'),
      containsThemeColor: manifestData.includes('"theme_color":"#FFD100"'),
      containsBackgroundColor: manifestData.includes('"background_color":"#0A0A0A"'),
      containsMaskableIcon: manifestData.includes('"purpose":"maskable"'),
    };

    report.serviceWorker = {
      scriptUrl: await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null),
      registrationScope: await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.scope ?? null;
      }),
      state: await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state ?? null;
      }),
      swResponseStatus: swResponse.status(),
      containsOfflineFallbackEntries:
        swText.includes("/offline") &&
        swText.includes("/fr/offline") &&
        swText.includes("/es/offline"),
      containsRuntimeCacheNames:
        swText.includes("marketing-pages") &&
        swText.includes("dashboard-shell-pages") &&
        swText.includes("api-read-models"),
    };

    assert(report.manifest.errors.length === 0, "Chrome reported manifest parsing/install errors.");
    assert(
      swResponse.ok(),
      `Expected /sw.js to load successfully, received ${swResponse.status()}.`
    );
    assert(
      report.manifest.containsStandaloneDisplay,
      "Manifest did not expose standalone display."
    );
    assert(report.manifest.containsMaskableIcon, "Manifest did not expose a maskable icon.");
    assert(
      report.serviceWorker.scriptUrl?.endsWith("/sw.js"),
      "Service worker controller was not using /sw.js on the deployed origin."
    );
    assert(
      report.serviceWorker.containsOfflineFallbackEntries,
      "Generated sw.js is missing locale-aware offline fallback entries on the deployed origin."
    );

    await navigateWithBypass(page, baseUrl, OFFLINE_MARKETING_PATH);

    const cacheSnapshot = await readCacheSnapshot(page);
    const precache = findCacheEntries(cacheSnapshot, "precache");
    const marketingCache = findCacheEntries(cacheSnapshot, "marketing-pages");

    report.caches = {
      names: cacheSnapshot.cacheNames,
      precache,
      marketingCache,
    };

    assert(precache.cacheName, "Expected a precache bucket to exist on the deployed origin.");
    assert(
      precache.entries.some((entry) => entry.startsWith("/offline")) &&
        precache.entries.some((entry) => entry.startsWith("/fr/offline")) &&
        precache.entries.some((entry) => entry.startsWith("/es/offline")),
      "Expected locale-aware offline documents in the deployed precache."
    );
    assert(
      marketingCache.entries.some((entry) => entry.startsWith(OFFLINE_MARKETING_PATH)),
      "Expected the deployed marketing route to be cached in marketing-pages."
    );

    await context.setOffline(true);

    const marketingResponse = await page.goto(`${baseUrl}${OFFLINE_MARKETING_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const marketingBody = await readVisibleBodyText(page);
    const normalizedMarketingBody = normalizeForMatch(marketingBody);
    report.marketingOffline = {
      responseStatus: marketingResponse?.status() ?? null,
      fromServiceWorker: marketingResponse?.fromServiceWorker() ?? null,
      url: page.url(),
      title: await page.title(),
      hasMarketingContent: FRENCH_MARKETING_MARKERS.some((marker) =>
        normalizedMarketingBody.includes(marker)
      ),
      hasOfflineFallbackDescription: normalizedMarketingBody.includes(
        FRENCH_OFFLINE_PAGE_DESCRIPTION
      ),
    };

    const fallbackResponse = await page.goto(`${baseUrl}${OFFLINE_FALLBACK_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const fallbackBody = await readVisibleBodyText(page);
    const normalizedFallbackBody = normalizeForMatch(fallbackBody);
    report.uncachedFallback = {
      responseStatus: fallbackResponse?.status() ?? null,
      fromServiceWorker: fallbackResponse?.fromServiceWorker() ?? null,
      url: page.url(),
      title: await page.title(),
      hasLocalizedOfflineHeading: normalizedFallbackBody.includes(FRENCH_OFFLINE_HEADING),
      hasLocalizedOfflineDescription: normalizedFallbackBody.includes(
        FRENCH_OFFLINE_PAGE_DESCRIPTION
      ),
    };

    assert(
      report.marketingOffline.fromServiceWorker === true &&
        report.marketingOffline.hasMarketingContent &&
        !report.marketingOffline.hasOfflineFallbackDescription,
      "Offline deployed marketing navigation did not stay on the cached marketing route."
    );
    assert(
      report.uncachedFallback.fromServiceWorker === true &&
        report.uncachedFallback.hasLocalizedOfflineHeading &&
        report.uncachedFallback.hasLocalizedOfflineDescription,
      "Uncached deployed offline navigation did not render the localized offline fallback."
    );

    await context.setOffline(false);
    await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });

    report.updatePrompt = EXPECT_UPDATE
      ? await verifyUpdatePrompt(page)
      : {
          verified: false,
          skipped: true,
          reason:
            "Set PWA_EXPECT_UPDATE=true after triggering a second deploy on the same preview to verify the update prompt.",
        };

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, message: error.message, report: latestReport }, null, 2)
  );
  process.exitCode = 1;
});
