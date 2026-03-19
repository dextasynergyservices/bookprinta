import { createPwaPluginConfig } from "./plugin-config";

describe("PWA plugin config", () => {
  it("enables the worker only for production builds", () => {
    expect(createPwaPluginConfig("production").disable).toBe(false);
    expect(createPwaPluginConfig("development").disable).toBe(true);
    expect(createPwaPluginConfig("test").disable).toBe(true);
  });

  it("pins the expected worker entry and public URL", () => {
    const config = createPwaPluginConfig("production");

    expect(config.swSrc).toBe("sw.ts");
    expect(config.swDest).toBe("public/sw.js");
    expect(config.swUrl).toBe("/sw.js");
    expect(config.scope).toBe("/");
  });

  it("keeps automatic registration on and supports navigation caching", () => {
    const config = createPwaPluginConfig("production");

    expect(config.register).toBe(true);
    expect(config.cacheOnNavigation).toBe(true);
  });

  it("avoids automatic reloads when the network reconnects", () => {
    expect(createPwaPluginConfig("production").reloadOnOnline).toBe(false);
  });

  it("precaches the locale-aware offline documents with a stable build revision", () => {
    const config = createPwaPluginConfig("production", "phase-9-6-test");

    expect(config.additionalPrecacheEntries).toEqual([
      { url: "/offline", revision: "phase-9-6-test" },
      { url: "/fr/offline", revision: "phase-9-6-test" },
      { url: "/es/offline", revision: "phase-9-6-test" },
    ]);
  });
});
