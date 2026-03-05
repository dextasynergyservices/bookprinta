import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { fetchResourceCategories } from "@/lib/api/resources";
import { ResourcesCategoryView } from "./ResourcesCategoryView";

interface ResourcesCategoryPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

const getResourceCategoriesCached = cache(async () => {
  try {
    return await fetchResourceCategories();
  } catch {
    return { categories: [] };
  }
});

async function getCategoryBySlug(slug: string) {
  const normalizedSlug = normalizeSlug(slug);
  const response = await getResourceCategoriesCached();

  return response.categories.find((category) => category.slug === normalizedSlug) ?? null;
}

export async function generateMetadata({ params }: ResourcesCategoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "resources" });

  const category = await getCategoryBySlug(slug);
  const normalizedSlug = normalizeSlug(slug);

  if (!category) {
    return {
      title: t("meta_title"),
      description: t("meta_description"),
      alternates: {
        canonical: `/resources/category/${normalizedSlug}`,
        languages: {
          en: `/resources/category/${normalizedSlug}`,
          fr: `/fr/resources/category/${normalizedSlug}`,
          es: `/es/resources/category/${normalizedSlug}`,
        },
      },
    };
  }

  return {
    title: t("category_meta_title", { category: category.name }),
    description: t("category_meta_description", { category: category.name }),
    openGraph: {
      title: t("category_meta_title", { category: category.name }),
      description: t("category_meta_description", { category: category.name }),
      type: "website",
    },
    alternates: {
      canonical: `/resources/category/${category.slug}`,
      languages: {
        en: `/resources/category/${category.slug}`,
        fr: `/fr/resources/category/${category.slug}`,
        es: `/es/resources/category/${category.slug}`,
      },
    },
  };
}

export default function ResourcesCategoryPage({ params }: ResourcesCategoryPageProps) {
  return <ResourcesCategoryPageContent params={params} />;
}

async function ResourcesCategoryPageContent({ params }: ResourcesCategoryPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  return <ResourcesCategoryView categorySlug={category.slug} categoryName={category.name} />;
}
