import { CheckCircle2, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResendSignupLinkForm } from "@/components/checkout/ResendSignupLinkForm";
import { Link } from "@/lib/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });

  return {
    title: `${t("payment_confirmation_title")} — BookPrinta`,
  };
}

export default async function CheckoutConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white md:px-6 md:py-14 lg:px-8">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-[#2A2A2A] bg-[#090909] p-6 md:p-8">
        <div className="flex size-14 items-center justify-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12 text-[#9fd0ff]">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </div>

        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          {t("payment_confirmation_title")}
        </h1>
        <p className="mt-3 font-sans text-sm leading-relaxed text-white/70 md:text-base">
          {t("payment_confirmation_subtitle")}
        </p>

        <div className="mt-6 rounded-2xl border border-[#2A2A2A] bg-black px-4 py-4">
          <p className="font-sans text-sm text-white/75">{t("payment_confirmation_note")}</p>
        </div>

        <ResendSignupLinkForm />

        <div className="mt-7 flex flex-col gap-3 md:flex-row">
          <Link
            href="/pricing"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-black px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff]"
          >
            {t("addons_back_to_pricing")}
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110"
          >
            <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
            {t("payment_confirmation_home_cta")}
          </Link>
        </div>
      </section>
    </main>
  );
}
