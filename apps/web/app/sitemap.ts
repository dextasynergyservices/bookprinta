import type { MetadataRoute } from "next";

const BASE_URL = "https://bookprinta.com";

const locales = ["en", "fr", "es"] as const;
const defaultLocale = "en";

function localizedUrl(path: string, locale: string): string {
  if (locale === defaultLocale) return `${BASE_URL}${path}`;
  return `${BASE_URL}/${locale}${path}`;
}

function localizedEntries(
  path: string,
  options: { changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }
): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: localizedUrl(path, locale),
    lastModified: new Date(),
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: {
      languages: Object.fromEntries(locales.map((l) => [l, localizedUrl(path, l)])),
    },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // Marketing pages
    ...localizedEntries("/", { changeFrequency: "weekly", priority: 1.0 }),
    ...localizedEntries("/pricing", { changeFrequency: "weekly", priority: 0.9 }),
    ...localizedEntries("/about", { changeFrequency: "monthly", priority: 0.7 }),
    ...localizedEntries("/showcase", { changeFrequency: "weekly", priority: 0.8 }),
    ...localizedEntries("/resources", { changeFrequency: "weekly", priority: 0.7 }),
    ...localizedEntries("/faq", { changeFrequency: "monthly", priority: 0.6 }),
    ...localizedEntries("/contact", { changeFrequency: "monthly", priority: 0.6 }),
    ...localizedEntries("/quote", { changeFrequency: "monthly", priority: 0.7 }),

    // Legal pages
    ...localizedEntries("/terms", { changeFrequency: "yearly", priority: 0.3 }),
    ...localizedEntries("/privacy", { changeFrequency: "yearly", priority: 0.3 }),
    ...localizedEntries("/cookies", { changeFrequency: "yearly", priority: 0.2 }),
    ...localizedEntries("/refund-policy", { changeFrequency: "yearly", priority: 0.3 }),

    // Auth (only login is crawl-worthy)
    ...localizedEntries("/login", { changeFrequency: "monthly", priority: 0.4 }),
  ];
}
