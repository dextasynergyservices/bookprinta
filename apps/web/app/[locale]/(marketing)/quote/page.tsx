import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { QuoteView } from "./QuoteView";

interface QuotePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: QuotePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quote" });

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
    },
    alternates: {
      canonical: "/quote",
      languages: {
        en: "/quote",
        fr: "/fr/quote",
        es: "/es/quote",
      },
    },
  };
}

export default function QuotePage({ params }: QuotePageProps) {
  return <QuotePageContent params={params} />;
}

async function QuotePageContent({ params }: QuotePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <QuoteView />;
}
