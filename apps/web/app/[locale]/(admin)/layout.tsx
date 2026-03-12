import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminAuthGate } from "@/components/admin/admin-auth-gate";
import { AdminShell } from "@/components/admin/admin-shell";

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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tCommon = await getTranslations("common");

  return (
    <AdminAuthGate>
      <a href="#main-content" className="skip-to-content">
        {tCommon("skip_to_main_content")}
      </a>
      <AdminShell>{children}</AdminShell>
    </AdminAuthGate>
  );
}
