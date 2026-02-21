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

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  return <HomePageContent params={params} />;
}

async function HomePageContent({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <ScrollProgress />
      <HeroSection />
      {/* Wrapper ensures all sections after hero stack ABOVE the fixed book background */}
      <div className="relative z-10">
        <HowItWorks />
        <PricingPreview />
        <ShowcasePreview />
        <Testimonials />
        <FaqPreview />
        <CtaSection />
      </div>
    </>
  );
}
