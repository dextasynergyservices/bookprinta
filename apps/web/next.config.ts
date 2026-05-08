import { withSentryConfig } from "@sentry/nextjs";
import withSerwist from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { pwaPluginConfig } from "./lib/pwa/plugin-config";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const SECURITY_HEADERS = [
  // Prevent MIME-type sniffing (e.g. serving a .txt as JS)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block the page from being embedded in an iframe (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Only send origin in Referer header, not the full path, for cross-origin requests
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Opt out of browser APIs BookPrinta does not use.
  // Note: payment is intentionally omitted — Stripe's Payment Request API
  // (Apple Pay / Google Pay) may be added in future.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Improve DNS prefetch performance for external resources
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply to every route, including API proxy routes
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async rewrites() {
    // Proxy all /api/* requests through Vercel to the NestJS backend.
    // This makes auth cookies first-party (same domain) so they survive
    // Chrome third-party cookie deprecation and SameSite restrictions.
    const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const apiOrigin = raw.replace(/\/api(\/v\d+)?\/?$/, "").replace(/\/+$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

const withPWA = withSerwist(pwaPluginConfig);

const hasSentryBuildAuth = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

const sentryBuildOptions = {
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: {
    disable: !hasSentryBuildAuth,
  },
  ...(hasSentryBuildAuth
    ? {
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      }
    : {}),
};

export default withSentryConfig(withPWA(withNextIntl(nextConfig)), sentryBuildOptions);
