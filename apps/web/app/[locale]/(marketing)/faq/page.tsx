import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqView } from "./FaqView";

interface FaqPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: FaqPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faq" });

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
    },
    alternates: {
      canonical: "/faq",
      languages: {
        en: "/faq",
        fr: "/fr/faq",
        es: "/es/faq",
      },
    },
  };
}

export default function FaqPage({ params }: FaqPageProps) {
  return <FaqContent params={params} />;
}

async function FaqContent({ params }: FaqPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      {/* JSON-LD FAQPage structured data for Google rich results */}
      <script
        type="application/ld+json"
        // biome-ignore lint: JSON-LD must be inline
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: Array.from({ length: 13 }, (_, i) => ({
              "@type": "Question",
              name: `{q${i + 1}}`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `{a${i + 1}}`,
              },
            })),
          }),
        }}
      />
      <FaqView />
    </>
  );
}
