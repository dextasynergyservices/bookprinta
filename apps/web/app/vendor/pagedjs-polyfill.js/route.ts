import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Force Next.js output file tracing to include this file on Vercel.
// Without a static require/import, the bundler doesn't know pagedjs is needed
// and strips it from the serverless function filesystem.
const require = createRequire(import.meta.url);

/**
 * Resolve the polyfill path using require.resolve — this is the ONLY strategy
 * that works reliably across local dev, Docker, and Vercel serverless.
 * CWD-based guessing fails on Vercel because the filesystem layout is different.
 */
function resolvePolyfillPath(): string {
  try {
    // require.resolve("pagedjs") returns the package entry point (e.g., .../dist/paged.esm.js).
    // The polyfill lives as a sibling file in the same dist/ directory.
    const entryPath = require.resolve("pagedjs");
    return path.resolve(path.dirname(entryPath), "paged.polyfill.min.js");
  } catch {
    throw new Error(
      "Unable to locate pagedjs polyfill: require.resolve('pagedjs') failed. " +
        "Ensure 'pagedjs' is listed in dependencies (not devDependencies) in apps/web/package.json."
    );
  }
}

// Lazy-read on first request to avoid running require.resolve during build-time
// page data collection (where webpack's bundled module resolution breaks it).
// Cached after first read — the file never changes at runtime.
let polyfillSource: string | null = null;

export async function GET() {
  if (!polyfillSource) {
    polyfillSource = readFileSync(resolvePolyfillPath(), "utf8");
  }

  return new Response(polyfillSource, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
