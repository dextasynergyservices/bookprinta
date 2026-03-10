import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);
let cachedPolyfillSource: string | null = null;

async function loadPagedJsPolyfill() {
  if (cachedPolyfillSource !== null) {
    return cachedPolyfillSource;
  }

  const packageEntryPath = require.resolve("pagedjs");
  const polyfillPath = path.resolve(
    path.dirname(packageEntryPath),
    "../dist/paged.polyfill.min.js"
  );
  cachedPolyfillSource = await readFile(polyfillPath, "utf8");

  return cachedPolyfillSource;
}

export async function GET() {
  const source = await loadPagedJsPolyfill();

  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
