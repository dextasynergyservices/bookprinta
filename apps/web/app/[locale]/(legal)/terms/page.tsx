import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  LegalDocument,
  type LegalDocumentSectionData,
} from "@/components/shared/legal/legal-document";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";

type TermsPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

function buildLocalizedPath(locale: string, pathname: "/terms") {
  return locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;
}

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  const canonical = buildLocalizedPath(locale, "/terms");

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical,
      languages: {
        en: "/terms",
        fr: "/fr/terms",
        es: "/es/terms",
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

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const tLegal = await getTranslations({ locale, namespace: "legal" });
  const t = await getTranslations({ locale, namespace: "legal.terms" });
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

  const sectionConfigs = [
    { id: "acceptance", key: "acceptance" },
    { id: "services", key: "services" },
    { id: "payment-policy", key: "payment" },
    { id: "refund-policy", key: "refund" },
    { id: "acceptable-content", key: "acceptable_content" },
    { id: "right-to-refuse-orders", key: "right_to_refuse" },
    { id: "liability-limitations", key: "liability_limitations" },
    { id: "governing-law", key: "governing_law" },
  ] as const;

  const sections: LegalDocumentSectionData[] = sectionConfigs.map(({ id, key }) => ({
    id,
    title: t(`sections.${key}.title`),
    paragraphs: getParagraphs(`sections.${key}`),
  }));

  return (
    <div className="relative">
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
    </div>
  );
}
