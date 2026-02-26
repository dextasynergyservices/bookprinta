import { withSentryConfig } from "@sentry/nextjs";
import withSerwist from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

const withPWA = withSerwist({
  swSrc: "sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

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
