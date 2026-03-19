import { metadata } from "./layout";
import manifest from "./manifest";

describe("PWA metadata", () => {
  it("publishes the required manifest install metadata", () => {
    const appManifest = manifest();

    expect(appManifest.id).toBe("/");
    expect(appManifest.scope).toBe("/");
    expect(appManifest.start_url).toBe("/");
    expect(appManifest.display).toBe("standalone");
    expect(appManifest.orientation).toBe("portrait");
    expect(appManifest.background_color).toBe("#0A0A0A");
    expect(appManifest.theme_color).toBe("#FFD100");
    expect(appManifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        }),
        expect.objectContaining({
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        }),
        expect.objectContaining({
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ])
    );
  });

  it("exposes install metadata for iOS home-screen behavior", () => {
    expect(metadata.applicationName).toBe("BookPrinta");
    expect(metadata.manifest).toBe("/manifest.webmanifest");
    expect(metadata.other).toEqual(
      expect.objectContaining({
        "apple-mobile-web-app-capable": "yes",
      })
    );
    expect(metadata.appleWebApp).toEqual(
      expect.objectContaining({
        capable: true,
        statusBarStyle: "black-translucent",
        title: "BookPrinta",
      })
    );
    expect(metadata.icons).toEqual(
      expect.objectContaining({
        apple: expect.arrayContaining([
          expect.objectContaining({
            url: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          }),
        ]),
        icon: expect.arrayContaining([
          expect.objectContaining({
            url: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          }),
          expect.objectContaining({
            url: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          }),
        ]),
      })
    );
  });
});
