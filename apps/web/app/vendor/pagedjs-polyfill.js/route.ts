import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);
let cachedPolyfillSource: string | null = null;
const POLYFILL_FILE_NAME = path.join("node_modules", "pagedjs", "dist", "paged.polyfill.min.js");

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePolyfillPath() {
  const candidatePaths = new Set<string>();
  let currentDirectory = process.cwd();

  while (true) {
    candidatePaths.add(path.join(currentDirectory, POLYFILL_FILE_NAME));
    candidatePaths.add(path.join(currentDirectory, "apps", "web", POLYFILL_FILE_NAME));

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }

    currentDirectory = parentDirectory;
  }

  try {
    const packageEntryPath = require.resolve("pagedjs");
    candidatePaths.add(
      path.resolve(path.dirname(packageEntryPath), "../dist/paged.polyfill.min.js")
    );
  } catch {
    // Fall through to filesystem candidate search below.
  }

  for (const candidatePath of candidatePaths) {
    if (await fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Unable to locate pagedjs polyfill. Checked: ${Array.from(candidatePaths).join(", ")}`
  );
}

async function loadPagedJsPolyfill() {
  if (cachedPolyfillSource !== null) {
    return cachedPolyfillSource;
  }

  const polyfillPath = await resolvePolyfillPath();
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
