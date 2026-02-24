import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";

import { FeatureComparisonTable } from "@/components/marketing/pricing/FeatureComparisonTable";
import { PricingCards } from "@/components/marketing/pricing/PricingCards";
import { PricingCTA } from "@/components/marketing/pricing/PricingCTA";
import { PricingFAQ } from "@/components/marketing/pricing/PricingFAQ";
import { PricingHero } from "@/components/marketing/pricing/PricingHero";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import type { Package } from "@/hooks/usePackages";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "pricing" });
  return {
    title: `${t("title")} — BookPrinta`,
    description: t("hero_subtitle"),
  };
}

export default async function PricingPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "pricing" });
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["packages"],
    queryFn: async () => {
      // In production/deployment NEXT_PUBLIC_API_URL should be defined.
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/v1/packages`);
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json().then((data: any[]) => {
        return data.map((pkg) => ({
          ...pkg,
          features: pkg.features.map((feat: string) => {
            let name = feat;
            let value: string | undefined;
            const group = "Features";

            if (feat.includes("copies, A5 size")) {
              name = "Printed Copies";
              value = feat.split(",")[0]; // "25 copies"
            } else if (feat.startsWith("Up to ") && feat.includes(" pages")) {
              name = "Page Limit";
              value = feat;
            } else if (feat.includes("Promo Flyers")) {
              const match = feat.match(/^(\d+)\s+(.+)$/);
              if (match) {
                value = match[1];
                name = match[2];
              }
            } else if (feat.includes("Promo Bookmarks")) {
              const match = feat.match(/^(\d+)\s+(.+)$/);
              if (match) {
                value = match[1];
                name = match[2];
              }
            } else if (feat.includes("e-Marketing Flyers")) {
              const match = feat.match(/^(\d+)\s+(.+)$/);
              if (match) {
                value = match[1];
                name = match[2];
              }
            }

            return {
              name,
              included: true,
              value,
              originalText: feat,
              group,
            };
          }),
        })) as Package[];
      });
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ScrollProgress />
      <main className="min-h-screen bg-primary pb-0 pt-0">
        <PricingHero />

        <div className="relative z-10 w-full pb-10 pt-8 md:pt-12 mt-8">
          <PricingCards />
        </div>

        <section className="mt-20 border-t border-white/5 pt-10">
          <FeatureComparisonTable />
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl font-bold text-primary-foreground md:text-4xl">
              {t("faq_title")}
            </h2>
          </div>
          <PricingFAQ />
        </section>

        <PricingCTA />
      </main>
    </HydrationBoundary>
  );
}
