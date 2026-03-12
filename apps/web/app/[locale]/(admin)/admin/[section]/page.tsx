import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdminNavigationItemBySection } from "@/components/admin/admin-navigation";

type AdminSectionPlaceholderPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function AdminSectionPlaceholderPage({
  params,
}: AdminSectionPlaceholderPageProps) {
  const { section } = await params;
  const navigationItem = getAdminNavigationItemBySection(section);

  if (!navigationItem) {
    notFound();
  }

  const tAdmin = await getTranslations("admin");
  const sectionLabel = tAdmin(navigationItem.labelKey);

  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {sectionLabel}
        </h1>
        <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("section_placeholder_description", { section: sectionLabel })}
        </p>
      </div>
    </section>
  );
}
