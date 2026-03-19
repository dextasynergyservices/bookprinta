import fs from "node:fs";
import path from "node:path";

describe("service worker runtime config", () => {
  it("waits for explicit client confirmation before activating an update", () => {
    const swSource = fs.readFileSync(path.resolve(process.cwd(), "sw.ts"), "utf8");

    expect(swSource).toContain("skipWaiting: false");
    expect(swSource).toContain("clientsClaim: true");
  });
});
