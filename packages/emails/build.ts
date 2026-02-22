// @ts-nocheck — Build script runs under Bun runtime (provides Bun, process globals).
// Excluded from tsconfig.json since it's a build tool, not library code.
/**
 * Build script for @bookprinta/emails package.
 *
 * Uses Bun's programmatic build API with NODE_ENV=production
 * to ensure the PRODUCTION JSX runtime is used (jsx from react/jsx-runtime).
 *
 * Without this, bun build defaults to the development JSX runtime (jsxDEV
 * from react/jsx-dev-runtime), which fails at runtime on Render's production
 * Node.js with "jsxDEV is not a function".
 *
 * The key fix is `define: { "process.env.NODE_ENV": '"production"' }` which
 * tells Bun's bundler to treat NODE_ENV as production at COMPILE time,
 * switching from jsxDEV (react/jsx-dev-runtime) → jsx (react/jsx-runtime).
 */

const result = await Bun.build({
  entrypoints: ["./index.ts", "./render.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
  splitting: true,
  packages: "external",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`✓ @bookprinta/emails built (${result.outputs.length} files)`);
