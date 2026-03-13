"use client";

import { Cog, MapPin, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { ProfileSettingsAddressesPanel } from "./profile-settings-addresses-panel";
import { ProfileSettingsProfilePanel } from "./profile-settings-profile-panel";
import { ProfileSettingsSettingsPanel } from "./profile-settings-settings-panel";

type ProfileSettingsTab = "addresses" | "profile" | "settings";

type TabConfig = {
  href: string;
  key: ProfileSettingsTab;
  labelKey: "addresses" | "profile" | "settings";
  icon: React.ComponentType<{ className?: string }>;
};

const TAB_CONFIGS: TabConfig[] = [
  { key: "profile", href: "/dashboard/profile", labelKey: "profile", icon: UserRound },
  { key: "settings", href: "/dashboard/settings", labelKey: "settings", icon: Cog },
  { key: "addresses", href: "/dashboard/settings/addresses", labelKey: "addresses", icon: MapPin },
];

function resolveSelectedTab(
  pathname: string,
  queryValue: string | null | undefined
): ProfileSettingsTab {
  if (queryValue === "addresses" || queryValue === "profile" || queryValue === "settings") {
    return queryValue;
  }

  if (
    pathname === "/dashboard/settings/addresses" ||
    pathname.startsWith("/dashboard/settings/addresses/")
  ) {
    return "addresses";
  }

  if (pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/")) {
    return "settings";
  }

  return "profile";
}

export function ProfileSettingsView() {
  const tDashboard = useTranslations("dashboard");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedTab = useMemo(
    () => resolveSelectedTab(pathname, searchParams.get("tab")),
    [pathname, searchParams]
  );

  return (
    <section className="px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="space-y-5">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {tDashboard(selectedTab)}
            </h1>
          </div>

          <nav className="border-b border-[#2A2A2A]">
            <ul className="-mb-px flex min-w-0 gap-4 overflow-x-auto">
              {TAB_CONFIGS.map((tab) => {
                const isActive = tab.key === selectedTab;
                const Icon = tab.icon;

                return (
                  <li key={tab.key} className="shrink-0">
                    <Link
                      href={tab.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "font-sans inline-flex min-h-11 items-center gap-2 border-b-2 px-1 pb-4 pt-1 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-4",
                        isActive
                          ? "border-[#007eff] text-white"
                          : "border-transparent text-[#A3A3A3] hover:text-white"
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span>{tDashboard(tab.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </header>

        {selectedTab === "profile" ? <ProfileSettingsProfilePanel /> : null}
        {selectedTab === "settings" ? <ProfileSettingsSettingsPanel /> : null}
        {selectedTab === "addresses" ? <ProfileSettingsAddressesPanel /> : null}
      </div>
    </section>
  );
}

export { resolveSelectedTab };
