import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContactView } from "./ContactView";

interface ContactPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ContactPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
    },
    alternates: {
      canonical: "/contact",
      languages: {
        en: "/contact",
        fr: "/fr/contact",
        es: "/es/contact",
      },
    },
  };
}

export default function ContactPage({ params }: ContactPageProps) {
  return <ContactContent params={params} />;
}

async function ContactContent({ params }: ContactPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      {/* JSON-LD ContactPage structured data */}
      <script
        type="application/ld+json"
        // biome-ignore lint: JSON-LD must be inline
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ContactPage",
            name: "Contact BookPrinta",
            description: "Get in touch with BookPrinta about your book publishing project.",
            url: "https://bookprinta.com/contact",
            contactPoint: {
              "@type": "ContactPoint",
              email: "hello@bookprinta.com",
              contactType: "customer service",
              availableLanguage: ["English", "French", "Spanish"],
            },
          }),
        }}
      />
      <ContactView />
    </>
  );
}
