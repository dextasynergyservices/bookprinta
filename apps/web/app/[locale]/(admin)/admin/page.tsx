import { getTranslations } from "next-intl/server";

export default async function AdminPage() {
  const tAdmin = await getTranslations("admin");

  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {tAdmin("analytics")}
        </h1>
        <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("workspace_description")}
        </p>
      </div>
    </section>
  );
}
