import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BookPrinta — Publish Your Book",
    short_name: "BookPrinta",
    description: "Turn your manuscript into a professional, print-ready book.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#007eff",
    icons: [
      { src: "/ICON-192.png", sizes: "192x192", type: "image/png" },
      { src: "/ICON-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
