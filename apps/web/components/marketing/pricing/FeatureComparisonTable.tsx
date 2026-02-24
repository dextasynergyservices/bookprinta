"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useRef, useState } from "react";

import { usePackages } from "@/hooks/usePackages";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function FeatureComparisonTable() {
  const t = useTranslations("pricing");
  const { data: tiers, isLoading } = usePackages();
  const containerRef = useRef<HTMLDivElement>(null);

  // Mobile tab state
  const [activeTierIdx, setActiveTierIdx] = useState(1); // Default to Glow Up (index 1)

  // Derive grouped features
  const featureGroups = useMemo(() => {
    if (!tiers) return [];

    const groups: Record<string, string[]> = {};

    tiers.forEach((tier) => {
      tier.features.forEach((f) => {
        const groupName = f.group || "General";
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        if (!groups[groupName].includes(f.name)) {
          groups[groupName].push(f.name);
        }
      });
    });

    return Object.entries(groups).map(([groupName, features]) => ({
      groupName,
      features,
    }));
  }, [tiers]);

  useGSAP(
    () => {
      if (!isLoading && tiers?.length) {
        gsap.from(".feature-row", {
          y: 20,
          opacity: 0,
          duration: 0.5,
          stagger: 0.05,
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 85%",
          },
        });
      }
    },
    { dependencies: [isLoading, tiers], scope: containerRef }
  );

  if (isLoading || !tiers) {
    return null; // The skeletons are shown in PricingCards, we can just hide this or show a block
  }

  return (
    <div ref={containerRef} className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
      <h2 className="mb-12 text-center font-display text-3xl font-bold text-primary-foreground md:text-5xl">
        {t("compare_title")}
      </h2>

      {/* Mobile Tabs */}
      <div className="mb-8 flex rounded-lg bg-secondary p-1 md:hidden">
        {tiers.map((tier, idx) => (
          <button
            key={tier.id}
            type="button"
            onClick={() => setActiveTierIdx(idx)}
            className={cn(
              "flex-1 rounded-md py-2 font-display text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent",
              activeTierIdx === idx
                ? "bg-accent text-accent-foreground"
                : "text-primary-foreground/70"
            )}
          >
            {tier.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto pb-10">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky top-0 z-20 w-1/3 border-b border-[#ededed]/20 bg-primary py-6 md:w-2/5"></th>
              {tiers.map((tier, idx) => (
                <th
                  key={tier.id}
                  className={cn(
                    "sticky top-0 z-20 border-b border-[#ededed]/20 bg-primary px-4 py-6 md:px-6",
                    "text-center font-display text-xl font-bold text-primary-foreground",
                    "max-md:w-2/3 md:w-1/5",
                    idx !== activeTierIdx ? "max-md:hidden" : ""
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    {tier.name}
                    {tier.popular && (
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-[10px] font-bold tracking-wider text-accent uppercase">
                        {t("most_popular")}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureGroups.map(({ groupName, features }) => (
              <Fragment key={groupName}>
                <tr>
                  <td
                    colSpan={tiers.length + 1}
                    className="border-y border-[#ededed]/10 bg-secondary/50 px-4 py-4 font-display text-xs font-bold tracking-widest text-[#ededed] uppercase"
                  >
                    {groupName}
                  </td>
                </tr>
                {features.map((featureName) => (
                  <tr
                    key={featureName}
                    className="feature-row border-b border-[#ededed]/5 transition-colors hover:bg-white/5"
                  >
                    <td className="w-1/3 px-4 py-4 font-serif text-sm text-primary-foreground/80 md:w-2/5">
                      {featureName}
                    </td>
                    {tiers.map((tier, tierIdx) => {
                      const fData = tier.features.find((f) => f.name === featureName);

                      return (
                        <td
                          key={tier.id}
                          className={cn(
                            "px-4 py-4 text-center font-sans text-sm md:px-6",
                            tierIdx !== activeTierIdx ? "max-md:hidden" : "",
                            tierIdx % 2 !== 0 ? "md:bg-white/[0.02]" : ""
                          )}
                        >
                          {fData?.included ? (
                            fData.value ? (
                              <span className="font-medium text-primary-foreground">
                                {fData.value}
                              </span>
                            ) : (
                              <Check className="mx-auto size-5 text-accent" />
                            )
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
