import { withSentryConfig } from "@sentry/nextjs";
import withSerwist from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { pwaPluginConfig } from "./lib/pwa/plugin-config";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Keep pagedjs out of the webpack bundle so require.resolve works at runtime
  // during Next.js page data collection (build) and in serverless functions.
  serverExternalPackages: ["pagedjs"],
  // Ensure pagedjs polyfill file is included in Vercel serverless function bundles.
  // Next.js output file tracing doesn't detect fs.readFileSync of node_modules files
  // unless we explicitly list them here.
  outputFileTracingIncludes: {
    "/vendor/pagedjs-polyfill.js": ["./node_modules/pagedjs/dist/**"],
  },
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
