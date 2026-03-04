import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DashboardAuthGate } from "@/components/dashboard/dashboard-auth-gate";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tCommon = await getTranslations("common");

  return (
    <DashboardAuthGate>
      <a href="#main-content" className="skip-to-content">
        {tCommon("skip_to_main_content")}
      </a>
      <DashboardShell>{children}</DashboardShell>
    </DashboardAuthGate>
  );
}
