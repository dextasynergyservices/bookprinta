import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

export default async function RefundPolicyPage() {
  const t = await getTranslations("legal_refund");

  return (
    <main className="min-h-[calc(100dvh-7rem)] bg-[#0A0A0A] px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-[#2A2A2A] bg-[#111111] p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
          {t("title")}
        </h1>
        <p className="font-sans mt-2 text-sm text-[#cfcfcf]">{t("subtitle")}</p>
        <p className="font-sans mt-1 text-xs text-[#8f8f8f]">{t("updated")}</p>

        <div className="mt-6 space-y-3">
          <p className="font-sans text-sm text-[#d8d8d8]">{t("intro")}</p>
          <p className="font-sans text-sm text-[#d8d8d8]">{t("point_1")}</p>
          <p className="font-sans text-sm text-[#d8d8d8]">{t("point_2")}</p>
          <p className="font-sans text-sm text-[#d8d8d8]">{t("point_3")}</p>
          <p className="font-sans text-sm text-[#d8d8d8]">{t("support")}</p>
        </div>

        <div className="mt-8">
          <Link
            href="/contact"
            className="font-sans inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {t("cta")}
          </Link>
        </div>
      </section>
    </main>
  );
}
