import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResourcesView } from "./ResourcesView";

interface ResourcesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ResourcesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "resources" });

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
    },
    alternates: {
      canonical: "/resources",
      languages: {
        en: "/resources",
        fr: "/fr/resources",
        es: "/es/resources",
      },
    },
  };
}

export default function ResourcesPage({ params }: ResourcesPageProps) {
  return <ResourcesPageContent params={params} />;
}

async function ResourcesPageContent({ params }: ResourcesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ResourcesView />;
}
