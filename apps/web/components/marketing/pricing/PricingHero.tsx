"use client";

import { useTranslations } from "next-intl";

export function PricingHero() {
  const t = useTranslations("pricing");

  return (
    <div className="relative flex overflow-hidden bg-primary">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-linear-to-br from-primary via-primary to-accent/10" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-6 pt-24 pb-8 text-center sm:items-start sm:justify-start sm:px-12 sm:pt-24 sm:pb-8 sm:text-left md:px-20 md:pb-8 md:pt-36 lg:px-32 lg:pb-10 lg:pt-44">
        <div>
          <h1 className="font-display text-5xl font-bold leading-[1] tracking-tight text-primary-foreground md:text-6xl lg:text-[5rem]">
            {t("hero_title")}
          </h1>
        </div>

        <p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-primary-foreground/45 sm:mt-6 sm:text-base md:mt-10 md:text-lg lg:text-xl">
          {t("hero_subtitle")}
        </p>
      </div>
    </div>
  );
}
