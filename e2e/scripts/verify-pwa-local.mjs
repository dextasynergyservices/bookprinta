import { chromium } from "@playwright/test";

const WEB_BASE_URL = process.env.PWA_WEB_BASE_URL || "http://localhost:3000";
const API_BASE_URL = process.env.PWA_API_BASE_URL || "http://localhost:3001";
const LOGIN_IDENTIFIER = process.env.PWA_LOGIN_IDENTIFIER || "admin@bookprinta.local";
const LOGIN_PASSWORD = process.env.PWA_LOGIN_PASSWORD || "Admin123!ChangeMe";
const LOGIN_RECAPTCHA_TOKEN = process.env.PWA_LOGIN_RECAPTCHA_TOKEN || "local-dev";
const OFFLINE_MARKETING_PATH = "/fr/about";
const OFFLINE_FALLBACK_PATH = "/fr/pwa-local-offline-miss";
const DASHBOARD_PATH = "/dashboard/books";
const PAYMENT_INITIALIZE_PATH = "/api/v1/payments/initialize";
const UPLOAD_PATH = "/api/v1/books/cm_pwa_local/upload";
const WEBHOOK_PATH = "/api/v1/webhooks/paystack";
const FRENCH_OFFLINE_PAGE_DESCRIPTION = "Vérifiez votre connexion et réessayez.";
const FRENCH_OFFLINE_BANNER_COPY =
  "Vous êtes hors ligne — certaines fonctionnalités nécessitent une connexion internet";
const FRENCH_DASHBOARD_SHELL_MARKERS = [
  "Mes livres",
  "Selectionnez un livre pour voir la progression",
  "Sélectionnez un livre pour voir la progression",
  "Suivez votre livre du paiement a la livraison.",
  "Suivez votre livre du paiement à la livraison.",
];
let latestReport = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureServiceWorkerControl(page) {
  await page.goto(`${WEB_BASE_URL}/about`, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);

  let hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!hasController) {
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  }

  assert(hasController, "Expected the page to be controlled by the service worker.");
}

async function login(context) {
  const response = await context.request.post(`${API_BASE_URL}/api/v1/auth/login`, {
    data: {
      identifier: LOGIN_IDENTIFIER,
      password: LOGIN_PASSWORD,
      recaptchaToken: LOGIN_RECAPTCHA_TOKEN,
    },
  });

  assert(response.ok(), `Expected login to succeed, received ${response.status()}.`);

  const cookies = await context.cookies();
  const accessTokenCookie = cookies.find((cookie) => cookie.name === "access_token");

  assert(accessTokenCookie, "Expected access_token cookie after local login.");

  return {
    loginStatus: response.status(),
    accessTokenCookieDomain: accessTokenCookie.domain,
    accessTokenCookiePath: accessTokenCookie.path,
  };
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

async function readVisibleBodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  const report = {
    checkedAt: new Date().toISOString(),
    webBaseUrl: WEB_BASE_URL,
    apiBaseUrl: API_BASE_URL,
    login: null,
    manifest: null,
    serviceWorker: null,
    caches: null,
    marketingOffline: null,
    dashboardOffline: null,
    uncachedFallback: null,
    protectedRequests: null,
  };
  latestReport = report;

  try {
    report.login = await login(context);
    await ensureServiceWorkerControl(page);

    const cdp = await context.newCDPSession(page);
    const manifestResult = await cdp.send("Page.getAppManifest");
    const swResponse = await context.request.get(`${WEB_BASE_URL}/sw.js`);
    const swText = await swResponse.text();

    report.manifest = {
      url: manifestResult.url,
      errors: manifestResult.errors,
      hasManifest: Boolean(manifestResult.data),
      containsStandaloneDisplay: manifestResult.data.includes('"display":"standalone"'),
      containsThemeColor: manifestResult.data.includes('"theme_color":"#FFD100"'),
      containsBackgroundColor: manifestResult.data.includes('"background_color":"#0A0A0A"'),
      containsMaskableIcon: manifestResult.data.includes('"purpose":"maskable"'),
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
      report.manifest.containsStandaloneDisplay,
      "Manifest did not expose standalone display."
    );
    assert(report.manifest.containsMaskableIcon, "Manifest did not expose a maskable icon.");
    assert(
      report.serviceWorker.scriptUrl?.endsWith("/sw.js"),
      "Service worker controller was not using /sw.js."
    );
    assert(
      report.serviceWorker.containsOfflineFallbackEntries,
      "Generated sw.js is missing locale-aware offline fallback entries."
    );

    await page.goto(`${WEB_BASE_URL}${OFFLINE_MARKETING_PATH}`, { waitUntil: "networkidle" });
    await page.goto(`${WEB_BASE_URL}${DASHBOARD_PATH}`, { waitUntil: "networkidle" });

    await page.evaluate(async (apiBaseUrl) => {
      await fetch(`${apiBaseUrl}/api/v1/notifications/unread-count`, {
        method: "GET",
        credentials: "include",
      });
    }, API_BASE_URL);

    const onlineDashboardUrl = page.url();
    const onlineDashboardContent = await readVisibleBodyText(page);

    await page.route(`${API_BASE_URL}${PAYMENT_INITIALIZE_PATH}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authorizationUrl: "https://payments.example/checkout",
          reference: "pwa-local-payment-ref",
        }),
      });
    });

    await page.route(`${API_BASE_URL}${UPLOAD_PATH}`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          bookId: "cm_pwa_local",
          fileId: "file_pwa_local",
        }),
      });
    });

    await page.route(`${API_BASE_URL}${WEBHOOK_PATH}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.evaluate(
      async ({ apiBaseUrl, paymentPath, uploadPath, webhookPath }) => {
        await fetch(`${apiBaseUrl}${paymentPath}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "PAYSTACK" }),
        });

        const formData = new FormData();
        formData.set("file", new Blob(["PWA local upload"], { type: "text/plain" }), "pwa.txt");
        await fetch(`${apiBaseUrl}${uploadPath}`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        await fetch(`${apiBaseUrl}${webhookPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "charge.success" }),
        });
      },
      {
        apiBaseUrl: API_BASE_URL,
        paymentPath: PAYMENT_INITIALIZE_PATH,
        uploadPath: UPLOAD_PATH,
        webhookPath: WEBHOOK_PATH,
      }
    );

    const cacheSnapshot = await readCacheSnapshot(page);
    const precache = findCacheEntries(cacheSnapshot, "precache");
    const marketingCache = findCacheEntries(cacheSnapshot, "marketing-pages");
    const dashboardCache = findCacheEntries(cacheSnapshot, "dashboard-shell-pages");
    const readonlyApiCache = findCacheEntries(cacheSnapshot, "api-read-models");
    const protectedCacheMatches = Object.values(cacheSnapshot.cachesByName)
      .flat()
      .filter(
        (entry) =>
          entry.includes("/api/v1/payments/") ||
          entry.includes(UPLOAD_PATH) ||
          entry.includes("/api/v1/webhooks/")
      );

    report.caches = {
      names: cacheSnapshot.cacheNames,
      precache,
      marketingCache,
      dashboardCache,
      readonlyApiCache,
    };

    report.protectedRequests = {
      paymentPath: PAYMENT_INITIALIZE_PATH,
      uploadPath: UPLOAD_PATH,
      webhookPath: WEBHOOK_PATH,
      cachedMatches: protectedCacheMatches,
    };

    assert(precache.cacheName, "Expected a precache bucket to exist.");
    assert(
      precache.entries.some((entry) => entry.startsWith("/offline")) &&
        precache.entries.some((entry) => entry.startsWith("/fr/offline")) &&
        precache.entries.some((entry) => entry.startsWith("/es/offline")),
      "Expected locale-aware offline documents in precache."
    );
    assert(
      marketingCache.entries.some((entry) => entry.startsWith(OFFLINE_MARKETING_PATH)),
      "Expected marketing route to be cached in marketing-pages."
    );
    assert(
      dashboardCache.entries.some((entry) => entry.startsWith(DASHBOARD_PATH)),
      "Expected dashboard route to be cached in dashboard-shell-pages."
    );
    assert(
      readonlyApiCache.entries.some((entry) =>
        entry.includes("/api/v1/notifications/unread-count")
      ),
      "Expected read-only API cache entries in api-read-models."
    );
    assert(
      protectedCacheMatches.length === 0,
      "Protected payment/upload/webhook requests were written into Cache Storage."
    );

    await context.setOffline(true);

    const marketingResponse = await page.goto(`${WEB_BASE_URL}${OFFLINE_MARKETING_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const marketingTitle = await page.title();
    const marketingBody = await readVisibleBodyText(page);
    report.marketingOffline = {
      responseStatus: marketingResponse?.status() ?? null,
      fromServiceWorker: marketingResponse?.fromServiceWorker() ?? null,
      url: page.url(),
      title: marketingTitle,
      hasOfflineFallbackDescription: marketingBody.includes(FRENCH_OFFLINE_PAGE_DESCRIPTION),
      hasOfflineBanner: marketingBody.includes(FRENCH_OFFLINE_BANNER_COPY),
      hasMarketingContent:
        marketingBody.toLowerCase().includes("notre histoire") ||
        marketingBody.toLowerCase().includes("l'édition, réinventée"),
    };

    const dashboardResponse = await page.goto(`${WEB_BASE_URL}${DASHBOARD_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);
    const dashboardBody = await readVisibleBodyText(page);
    report.dashboardOffline = {
      responseStatus: dashboardResponse?.status() ?? null,
      fromServiceWorker: dashboardResponse?.fromServiceWorker() ?? null,
      url: page.url(),
      hasDashboardShellCopy: FRENCH_DASHBOARD_SHELL_MARKERS.some((marker) =>
        dashboardBody.includes(marker)
      ),
      hasOfflineFallbackDescription: dashboardBody.includes(FRENCH_OFFLINE_PAGE_DESCRIPTION),
      redirectedAwayFromDashboard: !page.url().includes(DASHBOARD_PATH),
      onlineDashboardUrl,
      onlineDashboardHadShellCopy: FRENCH_DASHBOARD_SHELL_MARKERS.some((marker) =>
        onlineDashboardContent?.includes(marker)
      ),
    };

    const fallbackResponse = await page.goto(`${WEB_BASE_URL}${OFFLINE_FALLBACK_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const fallbackBody = await readVisibleBodyText(page);
    report.uncachedFallback = {
      responseStatus: fallbackResponse?.status() ?? null,
      fromServiceWorker: fallbackResponse?.fromServiceWorker() ?? null,
      url: page.url(),
      title: await page.title(),
      hasLocalizedOfflineHeading: fallbackBody.includes("Vous êtes hors ligne"),
      hasLocalizedOfflineDescription: fallbackBody.includes(
        "Vérifiez votre connexion et réessayez."
      ),
    };

    assert(
      report.marketingOffline.fromServiceWorker === true &&
        report.marketingOffline.hasMarketingContent &&
        !report.marketingOffline.hasOfflineFallbackDescription,
      "Offline marketing page did not load from the cached marketing route."
    );
    assert(
      report.uncachedFallback.fromServiceWorker === true &&
        report.uncachedFallback.hasLocalizedOfflineHeading,
      "Uncached offline navigation did not render the localized offline fallback."
    );

    if (
      report.dashboardOffline.fromServiceWorker !== true ||
      !report.dashboardOffline.hasDashboardShellCopy ||
      report.dashboardOffline.redirectedAwayFromDashboard ||
      report.dashboardOffline.hasOfflineFallbackDescription
    ) {
      throw new Error(
        "Offline dashboard shell validation did not stay on the cached dashboard route."
      );
    }

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
