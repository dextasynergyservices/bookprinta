import { withSentryConfig } from "@sentry/nextjs";
import withSerwist from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { pwaPluginConfig } from "./lib/pwa/plugin-config";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

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
