import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/admin/", "/signup/", "/api/"],
      },
    ],
    sitemap: "https://bookprinta.com/sitemap.xml",
  };
}
