import { readFileSync } from "node:fs";
import path from "node:path";

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

describe("PWA build tooling", () => {
  it("uses webpack for production builds so Serwist can emit the worker", () => {
    const packageJson = readJsonFile<{ scripts?: Record<string, string> }>(
      path.resolve(process.cwd(), "package.json")
    );

    expect(packageJson.scripts?.build).toBe("next build --webpack");
  });

  it("ignores generated worker artifacts in the app workspace", () => {
    const gitignore = readFileSync(path.resolve(process.cwd(), ".gitignore"), "utf8");

    expect(gitignore).toContain("/public/sw.js");
    expect(gitignore).toContain("/public/sw.js.map");
    expect(gitignore).toContain("/public/swe-worker-*.js");
    expect(gitignore).toContain("/public/swe-worker-*.js.map");
  });

  it("records generated worker assets as Turbo build outputs", () => {
    const turboConfig = readJsonFile<{
      tasks?: {
        build?: {
          outputs?: string[];
        };
      };
    }>(path.resolve(process.cwd(), "..", "..", "turbo.json"));

    expect(turboConfig.tasks?.build?.outputs).toEqual(
      expect.arrayContaining([
        "public/sw.js",
        "public/sw.js.map",
        "public/swe-worker-*.js",
        "public/swe-worker-*.js.map",
      ])
    );
  });
});
