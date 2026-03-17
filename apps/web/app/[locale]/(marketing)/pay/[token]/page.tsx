import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PayByTokenView } from "./PayByTokenView";

interface PayByTokenPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({ params }: PayByTokenPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quote_pay" });

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
    },
  };
}

export default function PayByTokenPage({ params }: PayByTokenPageProps) {
  return <PayByTokenPageContent params={params} />;
}

async function PayByTokenPageContent({ params }: PayByTokenPageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <PayByTokenView token={token} />;
}
