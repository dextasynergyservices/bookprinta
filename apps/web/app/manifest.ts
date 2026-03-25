import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BookPrinta — Publish Your Book",
    short_name: "BookPrinta",
    description:
      "Your Book. Beautifully Printed. Publish fearlessly \u2014 from as low as 25 copies.",
    start_url: "/",
    scope: "/",
    lang: "en",
    dir: "ltr",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
