"use client";

import { UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

type DashboardCompleteProfileBannerProps = {
  onDismiss: () => void;
};

export function DashboardCompleteProfileBanner({ onDismiss }: DashboardCompleteProfileBannerProps) {
  const tDashboard = useTranslations("dashboard");

  // One compact line: it shows on every dashboard page except the overview
  // (which has its own profile action), so it must not push content down.
  return (
    <aside
      aria-live="polite"
      aria-label={tDashboard("complete_profile_banner_aria")}
      className="w-full border-b border-[#F59E0B]/35 bg-[#FEF3C7] font-sans text-[#92400E]"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-1.5 sm:px-5 lg:px-8">
        <UserRound className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />

        <p className="min-w-0 flex-1 text-sm leading-5">
          <span className="hidden md:inline">{tDashboard("complete_profile_banner")} </span>
          <Link
            href="/dashboard/profile"
            className="inline-flex min-h-11 items-center font-semibold text-[#0057b8] underline underline-offset-2 hover:text-[#003f87] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 md:min-h-0"
          >
            {tDashboard("complete_profile_cta")}
          </Link>
          <span className="md:hidden"> — {tDashboard("complete_profile_banner_short")}</span>
        </p>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={tDashboard("complete_profile_dismiss")}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[#92400E] transition-colors duration-150 hover:bg-[#FFF7DA] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
