import { ArrowRight, CheckCircle2, Home } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return {
    title: `${t("signup_finish_verified_title")} — BookPrinta`,
  };
}

export default async function SignupFinishConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <main className="relative min-h-screen overflow-hidden bg-primary px-4 py-12 text-primary-foreground md:px-6 md:py-16 lg:px-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-90"
        aria-hidden="true"
        style={{
          background: "radial-gradient(80% 60% at 50% 0%, rgba(0,126,255,0.16), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 opacity-80 blur-3xl"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, rgba(0,126,255,0.14), transparent 70%)" }}
      />

      <section className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#090909] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)] md:p-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-44"
          aria-hidden="true"
          style={{
            background: "linear-gradient(180deg, rgba(0,126,255,0.14) 0%, rgba(0,126,255,0) 100%)",
          }}
        />

        <div className="relative">
          <p className="inline-flex rounded-full border border-[#007eff]/40 bg-[#007eff]/10 px-3 py-1 font-sans text-[11px] font-medium tracking-[0.08em] text-[#9fd0ff] uppercase">
            {t("signup")}
          </p>

          <div className="mt-5 flex size-14 items-center justify-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12 text-[#9fd0ff]">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-primary-foreground md:text-4xl">
            {t("signup_finish_verified_title")}
          </h1>
          <p className="mt-3 max-w-2xl font-serif text-base leading-relaxed text-primary-foreground/65">
            {t("signup_finish_verified_subtitle")}
          </p>

          <div className="mt-7 flex flex-col gap-3 md:flex-row">
            <Link
              href="/"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-black px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff]"
            >
              <Home className="mr-2 size-4" aria-hidden="true" />
              {t("signup_finish_back_home")}
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white shadow-[0_10px_28px_rgba(0,126,255,0.3)] transition-all duration-150 hover:brightness-110"
            >
              {t("signup_finish_proceed_dashboard")}
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
