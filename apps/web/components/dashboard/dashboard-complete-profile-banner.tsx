"use client";

import { UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";

type DashboardCompleteProfileBannerProps = {
  onDismiss: () => void;
};

export function DashboardCompleteProfileBanner({ onDismiss }: DashboardCompleteProfileBannerProps) {
  const tDashboard = useTranslations("dashboard");

  return (
    <aside
      aria-live="polite"
      aria-label={tDashboard("complete_profile_banner_aria")}
      className="w-full border-b border-[#F59E0B]/35 bg-[#FEF3C7] font-sans text-[#92400E]"
    >
      <div className="mx-auto flex max-w-[1600px] items-start gap-3 px-4 py-4 sm:px-5 lg:px-8">
        <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFF7DA] text-[#92400E]">
          <UserRound className="size-4" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#92400E]">
            {tDashboard("profile")}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#92400E]">
            {tDashboard("complete_profile_banner")}
          </p>
          <div className="mt-3">
            <Button
              asChild
              className="min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
            >
              <Link href="/dashboard/profile">{tDashboard("complete_profile_cta")}</Link>
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={tDashboard("complete_profile_dismiss")}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[#D6B76A] bg-[#FFF7DA] text-[#92400E] transition-colors duration-150 hover:border-[#007eff] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
