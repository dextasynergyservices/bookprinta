/**
 * Post-build script: Fix bare directory imports for ESM compatibility.
 *
 * SWC may strip "/index.js" from barrel imports (e.g. "./guards/index.js" → "./guards").
 * Node.js ESM does NOT support directory imports — this script resolves them.
 */

const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");

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

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;

  // Match relative imports/exports: from "./something" or from '../something'
  content = content.replace(
    /((?:from|import)\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (match, prefix, importPath, suffix) => {
      // Skip if already has a file extension
      if (/\.\w+$/.test(importPath)) return match;

      // Check if it's a directory with an index.js
      const resolved = path.resolve(path.dirname(filePath), importPath);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        if (fs.existsSync(path.join(resolved, "index.js"))) {
          changed = true;
          return `${prefix}${importPath}/index.js${suffix}`;
        }
      }

      // Check if adding .js resolves it
      if (fs.existsSync(resolved + ".js")) {
        changed = true;
        return `${prefix}${importPath}.js${suffix}`;
      }

      return match;
    }
  );

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log("  Fixed:", path.relative(distDir, filePath));
  }
}

if (!fs.existsSync(distDir)) {
  console.error("dist/ directory not found. Run nest build first.");
  process.exit(1);
}

walk(distDir);
console.log("ESM import fix complete.");
