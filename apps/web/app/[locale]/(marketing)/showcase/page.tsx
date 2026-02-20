import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShowcaseView } from "./ShowcaseView";

interface ShowcasePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ShowcasePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "showcase" });

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
    },
    alternates: {
      canonical: "/showcase",
      languages: {
        en: "/showcase",
        fr: "/fr/showcase",
        es: "/es/showcase",
      },
    },
  };
}

export default function ShowcasePage({ params }: ShowcasePageProps) {
  return <ShowcaseContent params={params} />;
}

async function ShowcaseContent({ params }: ShowcasePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ShowcaseView />;
}
