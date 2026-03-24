/**
 * Copies the pagedjs polyfill from node_modules to public/vendor/
 * so it can be served as a static file by Vercel's CDN.
 *
 * Run before `next build` via the "prebuild" npm script.
 */
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const entryPath = require.resolve("pagedjs");
// require.resolve returns lib/index.cjs — go up to package root, then into dist/
const packageRoot = path.resolve(path.dirname(entryPath), "..");
const polyfillSrc = path.join(packageRoot, "dist", "paged.polyfill.js");
const dest = path.resolve("public", "vendor", "pagedjs-polyfill.js");

mkdirSync(path.dirname(dest), { recursive: true });
cpSync(polyfillSrc, dest);

console.log(`✓ Copied pagedjs polyfill → ${dest}`);
