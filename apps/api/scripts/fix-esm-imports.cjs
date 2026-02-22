/**
 * Post-build script: Fix ALL ESM import issues in dist/.
 *
 * Handles four cases that break Node.js ESM:
 * 1. .ts/.tsx extensions in imports (./class.ts → ./class.js)
 * 2. Bare directory imports (./guards → ./guards/index.js)
 * 3. Missing .js extensions on relative imports
 * 4. Dynamic import() calls with .ts/.tsx extensions
 *
 * Runs after `nest build` — ensures dist/ is fully Node.js ESM-compatible.
 * Required because:
 *   - SWC doesn't rewrite .ts extensions in import specifier strings
 *   - Prisma 7 may generate .ts imports depending on platform/version
 *   - resolveFully in .swcrc handles most cases but not all edge cases
 */

const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
let totalFixed = 0;
let filesFixed = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".js")) {
      fixFile(full);
    }
  }
}

/**
 * Core import rewriter — handles a single import specifier.
 * Used by both static and dynamic import regex passes.
 */
function rewriteImport(importPath, fileDir) {
  // Case 1: .ts or .tsx extension → rewrite to .js
  if (/\.tsx?$/.test(importPath)) {
    const rewritten = importPath.replace(/\.tsx?$/, ".js");
    const resolved = path.resolve(fileDir, rewritten);
    if (fs.existsSync(resolved)) {
      return rewritten;
    }
    // Fallback: try as directory with index.js
    const bare = importPath.replace(/\.tsx?$/, "");
    const bareResolved = path.resolve(fileDir, bare);
    if (
      fs.existsSync(bareResolved) &&
      fs.statSync(bareResolved).isDirectory() &&
      fs.existsSync(path.join(bareResolved, "index.js"))
    ) {
      return `${bare}/index.js`;
    }
    // Still rewrite .ts → .js even if target doesn't exist yet
    return rewritten;
  }

  // Skip if already has a valid JS extension
  if (/\.m?js$/.test(importPath) || /\.json$/.test(importPath)) {
    return null; // no change needed
  }

  // Case 2: Bare path → check if directory with index.js
  const resolved = path.resolve(fileDir, importPath);
  if (
    fs.existsSync(resolved) &&
    fs.statSync(resolved).isDirectory() &&
    fs.existsSync(path.join(resolved, "index.js"))
  ) {
    return `${importPath}/index.js`;
  }

  // Case 3: Bare path → check if adding .js resolves it
  if (fs.existsSync(resolved + ".js")) {
    return `${importPath}.js`;
  }

  return null; // no change needed
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let fileFixCount = 0;
  const fileDir = path.dirname(filePath);

  // Pass 1: Static imports/exports — from "...", import "...", export * from "..."
  content = content.replace(
    /((?:from|import)\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (match, prefix, importPath, suffix) => {
      const result = rewriteImport(importPath, fileDir);
      if (result !== null) {
        fileFixCount++;
        return `${prefix}${result}${suffix}`;
      }
      return match;
    }
  );

  // Pass 2: Dynamic import() calls — import("./something.ts")
  content = content.replace(
    /(import\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g,
    (match, prefix, importPath, suffix) => {
      const result = rewriteImport(importPath, fileDir);
      if (result !== null) {
        fileFixCount++;
        return `${prefix}${result}${suffix}`;
      }
      return match;
    }
  );

  if (fileFixCount > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`  Fixed: ${path.relative(distDir, filePath)} (${fileFixCount} imports)`);
    totalFixed += fileFixCount;
    filesFixed++;
  }
}

if (!fs.existsSync(distDir)) {
  console.error("dist/ directory not found. Run nest build first.");
  process.exit(1);
}

console.log("Scanning dist/ for ESM import issues...");
walk(distDir);

if (totalFixed > 0) {
  console.log(`ESM import fix complete: ${totalFixed} imports fixed in ${filesFixed} files.`);
} else {
  console.log("ESM import fix complete: no issues found.");
}
