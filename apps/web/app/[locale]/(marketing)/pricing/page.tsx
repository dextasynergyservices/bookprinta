import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FeatureComparisonTable } from "@/components/marketing/pricing/FeatureComparisonTable";
import { PricingCards } from "@/components/marketing/pricing/PricingCards";
import { PricingCTA } from "@/components/marketing/pricing/PricingCTA";
import { PricingFAQ } from "@/components/marketing/pricing/PricingFAQ";
import { PricingHero } from "@/components/marketing/pricing/PricingHero";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import {
  fetchPackageCategories,
  PACKAGE_CATEGORIES_QUERY_KEY,
  type PackageCategory,
} from "@/lib/api/packages";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "pricing" });
  return {
    title: `${t("title")} — BookPrinta`,
    description: t("meta_description"),
  };
}

export default async function PricingPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "pricing" });
  const queryClient = new QueryClient();

  // Prefetch categories with nested packages for SSR hydration
  await queryClient.prefetchQuery({
    queryKey: PACKAGE_CATEGORIES_QUERY_KEY,
    queryFn: (): Promise<PackageCategory[]> => fetchPackageCategories({ revalidate: 600 }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ScrollProgress />
      <main className="min-h-screen bg-primary">
        <PricingHero />

        {/* Package cards — grouped by category */}
        <section className="relative z-10 w-full pb-10 pt-10 md:pt-14">
          <Suspense>
            <PricingCards />
          </Suspense>
        </section>

        {/* Feature comparison table */}
        <section className="border-t border-white/[0.06]" aria-labelledby="compare-heading">
          <FeatureComparisonTable />
        </section>

        {/* FAQ */}
        <section className="bg-primary-foreground" aria-labelledby="pricing-faq-heading">
          <div className="mx-auto max-w-7xl px-5 py-20 md:py-28 lg:px-8">
            <div className="mb-12 text-center md:mb-16">
              <h2
                id="pricing-faq-heading"
                className="font-display text-3xl font-bold tracking-tight text-primary md:text-4xl lg:text-5xl"
              >
                {t("faq_title")}
              </h2>
              <p className="mx-auto mt-4 max-w-lg font-serif text-base text-primary/55 md:text-lg">
                {t("faq_subtitle")}
              </p>
            </div>
            <PricingFAQ variant="light" />
          </div>
        </section>

        {/* CTA */}
        <PricingCTA />
      </main>
    </HydrationBoundary>
  );
}
