import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  LegalDocument,
  type LegalDocumentSectionData,
} from "@/components/shared/legal/legal-document";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";

type CookiesPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

function buildLocalizedPath(locale: string, pathname: "/cookies") {
  return locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;
}

export async function generateMetadata({ params }: CookiesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.cookies_page" });
  const canonical = buildLocalizedPath(locale, "/cookies");

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical,
      languages: {
        en: "/cookies",
        fr: "/fr/cookies",
        es: "/es/cookies",
      },
    },
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      url: canonical,
      type: "article",
    },
  };
}

export default async function CookiesPage({ params }: CookiesPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const tLegal = await getTranslations({ locale, namespace: "legal" });
  const t = await getTranslations({ locale, namespace: "legal.cookies_page" });
  const contactEmail = tLegal("contact_email");

  const renderParagraph = (key: string) =>
    t.rich(key, {
      contactEmail,
      contactPage: (chunks) => (
        <Link
          href="/contact"
          className="font-sans text-sm font-medium uppercase tracking-[0.12em] text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-muted-foreground"
        >
          {chunks}
        </Link>
      ),
      email: (chunks) => (
        <a
          href={`mailto:${contactEmail}`}
          className="font-sans text-sm font-medium uppercase tracking-[0.12em] text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-muted-foreground"
        >
          {chunks}
        </a>
      ),
    });

  const getParagraphs = (sectionKey: string) =>
    Array.from({ length: 4 }, (_, index) => `${sectionKey}.paragraph_${index + 1}`)
      .filter((key) => t.has(key))
      .map((key) => ({
        id: key,
        content: renderParagraph(key),
      }));

  const sections: LegalDocumentSectionData[] = [
    "what_cookies_are",
    "how_we_use_cookies",
    "cookie_choices",
    "third_party_tools",
    "contact",
  ].map((sectionKey) => ({
    id: sectionKey,
    title: t(`sections.${sectionKey}.title`),
    paragraphs: getParagraphs(`sections.${sectionKey}`),
  }));

  return (
    <LegalDocument
      className="pb-16 pt-8 sm:pb-20 sm:pt-10 lg:pb-24 lg:pt-12"
      title={t("title")}
      lastUpdatedLabel={tLegal("last_updated_label")}
      lastUpdatedDate={t("last_updated_date")}
      intro={[
        {
          id: "intro.paragraph_1",
          content: renderParagraph("intro.paragraph_1"),
        },
        {
          id: "intro.paragraph_2",
          content: renderParagraph("intro.paragraph_2"),
        },
      ]}
      sections={sections}
    />
  );
}
