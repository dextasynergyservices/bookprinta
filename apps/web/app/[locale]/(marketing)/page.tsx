import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { setRequestLocale } from "next-intl/server";
import { HeroSection } from "@/components/marketing/hero";
import {
  CtaSection,
  FaqPreview,
  HowItWorks,
  PricingPreview,
  ShowcasePreview,
  Testimonials,
} from "@/components/marketing/home";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { fetchPackageCategories, PACKAGE_CATEGORIES_QUERY_KEY } from "@/lib/api/packages";
import { fetchFeaturedShowcasePreview } from "@/lib/api/showcase";

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  return <HomePageContent params={params} />;
}

export async function HomePageContent({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const queryClient = new QueryClient();

  const [featuredShowcaseResult, packagePrefetchResult] = await Promise.allSettled([
    fetchFeaturedShowcasePreview({ limit: 4, revalidate: 30 }),
    queryClient.prefetchQuery({
      queryKey: PACKAGE_CATEGORIES_QUERY_KEY,
      queryFn: () => fetchPackageCategories({ revalidate: 30 }),
    }),
  ]);

  if (featuredShowcaseResult.status === "rejected") {
    console.error("[home-ssr] featured showcase prefetch failed", featuredShowcaseResult.reason);
  }

  if (packagePrefetchResult.status === "rejected") {
    console.error("[home-ssr] pricing prefetch failed", packagePrefetchResult.reason);
  }

  const featuredShowcase =
    featuredShowcaseResult.status === "fulfilled" ? featuredShowcaseResult.value : [];

  return (
    <>
      <ScrollProgress />
      <HeroSection />
      {/* Wrapper ensures all sections after hero stack ABOVE the fixed book background */}
      <div className="relative z-10">
        <HowItWorks />
        <HydrationBoundary state={dehydrate(queryClient)}>
          <PricingPreview />
        </HydrationBoundary>
        <ShowcasePreview entries={featuredShowcase} />
        <Testimonials />
        <FaqPreview />
        <CtaSection />
      </div>
    </>
  );
}
