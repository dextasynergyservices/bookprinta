import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AboutView } from "./AboutView";

interface AboutPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });

  const localizedPath = locale === "en" ? "/about" : `/${locale}/about`;
  const canonicalPath = "/about";
  const ogImage = "/logo-main-white.png";

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    openGraph: {
      title: t("meta_og_title"),
      description: t("meta_og_description"),
      type: "website",
      url: localizedPath,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: t("meta_og_image_alt"),
        },
      ],
    },
    alternates: {
      canonical: canonicalPath,
      languages: {
        en: "/about",
        fr: "/fr/about",
        es: "/es/about",
      },
    },
  };
}

export default function AboutPage({ params }: AboutPageProps) {
  return <AboutPageContent params={params} />;
}

async function AboutPageContent({ params }: AboutPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "about" });

  return (
    <>
      {/* JSON-LD Organization structured data */}
      <script
        type="application/ld+json"
        // biome-ignore lint: JSON-LD must be inline
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: t("jsonld_name"),
            url: "https://bookprinta.com",
            logo: "https://bookprinta.com/logo-main-white.png",
            description: t("jsonld_description"),
            sameAs: [],
            contactPoint: {
              "@type": "ContactPoint",
              contactType: t("jsonld_contact_type"),
              email: "hello@bookprinta.com",
              availableLanguage: [
                t("jsonld_language_en"),
                t("jsonld_language_fr"),
                t("jsonld_language_es"),
              ],
            },
            areaServed: {
              "@type": "Country",
              name: t("jsonld_area_served"),
            },
          }),
        }}
      />
      <AboutView />
    </>
  );
}
