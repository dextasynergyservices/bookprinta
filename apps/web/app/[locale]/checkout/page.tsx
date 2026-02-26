import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckoutView } from "./CheckoutView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });

  return {
    title: `${t("title")} — BookPrinta`,
  };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CheckoutView />;
}
