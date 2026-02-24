// @ts-nocheck — Build script runs under Bun runtime (provides Bun, process globals).
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

if (existsSync("./dist")) {
  rmSync("./dist", { recursive: true, force: true });
}

const schemaEntrypoints = readdirSync("./schemas", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => join("./schemas", entry.name).replace(/\\/g, "/"));

const result = await Bun.build({
  entrypoints: ["./index.ts", ...schemaEntrypoints],
  outdir: "./dist",
  target: "node",
  format: "esm",
  splitting: false,
  packages: "external",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`✓ @bookprinta/shared built (${result.outputs.length} files)`);
