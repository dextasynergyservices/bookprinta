import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { CheckoutView } from "@/app/[locale]/checkout/CheckoutView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });

  return {
    title: `${t("title")} — BookPrinta`,
  };
}

export default async function DashboardNewBookCheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={null}>
      <CheckoutView variant="dashboard" />
    </Suspense>
  );
}
