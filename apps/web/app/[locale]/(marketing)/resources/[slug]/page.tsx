import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import {
  fetchPublishedResourceSlugsForStaticParams,
  fetchResourceDetailForServer,
  fetchResourcesPage,
} from "@/lib/api/resources";
import { getSafeResourceImageUrl } from "@/lib/resources-media";
import { sanitizeArticleHtml } from "@/lib/sanitize-article-html";
import type { ResourceDetail, ResourceListItem } from "@/types/resources";
import { ResourceArticleView } from "./ResourceArticleView";

interface ResourceArticlePageProps {
  params: Promise<{ locale: string; slug: string }>;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function getLocalizedArticlePath(locale: string, slug: string): string {
  const normalizedSlug = normalizeSlug(slug);
  return locale === "en"
    ? `/resources/${normalizedSlug}`
    : `/${locale}/resources/${normalizedSlug}`;
}

function getAbsoluteUrl(path: string): string {
  return `https://bookprinta.com${path}`;
}

const getArticleBySlugCached = cache(async (slug: string) => {
  return fetchResourceDetailForServer(normalizeSlug(slug));
});

const getRelatedArticlesCached = cache(
  async (article: ResourceDetail): Promise<ResourceListItem[]> => {
    const related: ResourceListItem[] = [];
    const seenSlugs = new Set([article.slug]);

    try {
      if (article.category?.slug) {
        const sameCategoryPage = await fetchResourcesPage({
          category: article.category.slug,
          limit: 9,
        });

        for (const item of sameCategoryPage.items) {
          const normalizedSlug = normalizeSlug(item.slug);
          if (seenSlugs.has(normalizedSlug)) continue;
          seenSlugs.add(normalizedSlug);
          related.push(item);
          if (related.length >= 3) return related;
        }
      }

      const fallbackPage = await fetchResourcesPage({ limit: 9 });
      for (const item of fallbackPage.items) {
        const normalizedSlug = normalizeSlug(item.slug);
        if (seenSlugs.has(normalizedSlug)) continue;
        seenSlugs.add(normalizedSlug);
        related.push(item);
        if (related.length >= 3) break;
      }

      return related;
    } catch {
      return related;
    }
  }
);

export async function generateStaticParams() {
  try {
    const slugs = await fetchPublishedResourceSlugsForStaticParams();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: ResourceArticlePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "resources" });
  const article = await getArticleBySlugCached(slug);

  if (!article) {
    const normalizedSlug = normalizeSlug(slug);
    return {
      title: t("meta_title"),
      description: t("meta_description"),
      alternates: {
        canonical: `/resources/${normalizedSlug}`,
        languages: {
          en: `/resources/${normalizedSlug}`,
          fr: `/fr/resources/${normalizedSlug}`,
          es: `/es/resources/${normalizedSlug}`,
        },
      },
    };
  }

  const localizedPath = getLocalizedArticlePath(locale, article.slug);
  const safeImageUrl = getSafeResourceImageUrl(article.coverImageUrl);
  const description = article.excerpt?.trim() || t("article_meta_description_fallback");

  return {
    title: t("article_meta_title", { title: article.title }),
    description,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      url: localizedPath,
      images: [
        {
          url: safeImageUrl,
          width: 1200,
          height: 630,
          alt: t("cover_alt", { title: article.title }),
        },
      ],
    },
    alternates: {
      canonical: `/resources/${article.slug}`,
      languages: {
        en: `/resources/${article.slug}`,
        fr: `/fr/resources/${article.slug}`,
        es: `/es/resources/${article.slug}`,
      },
    },
  };
}

export default function ResourceArticlePage({ params }: ResourceArticlePageProps) {
  return <ResourceArticlePageContent params={params} />;
}

async function ResourceArticlePageContent({ params }: ResourceArticlePageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "resources" });
  const article = await getArticleBySlugCached(slug);

  if (!article) {
    notFound();
  }

  const safeHtmlContent = sanitizeArticleHtml(article.content);
  const relatedArticles = await getRelatedArticlesCached(article);
  const localizedPath = getLocalizedArticlePath(locale, article.slug);
  const safeImageUrl = getSafeResourceImageUrl(article.coverImageUrl);
  const description = article.excerpt?.trim() || t("article_meta_description_fallback");

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    image: [safeImageUrl],
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    mainEntityOfPage: getAbsoluteUrl(localizedPath),
    author: {
      "@type": "Organization",
      name: "BookPrinta",
    },
    publisher: {
      "@type": "Organization",
      name: "BookPrinta",
      logo: {
        "@type": "ImageObject",
        url: "https://bookprinta.com/logo-main-white.png",
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint: JSON-LD must be inline
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <ResourceArticleView
        article={article}
        safeHtmlContent={safeHtmlContent}
        relatedArticles={relatedArticles}
      />
    </>
  );
}
