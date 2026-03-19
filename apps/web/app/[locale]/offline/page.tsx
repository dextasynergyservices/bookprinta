import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OfflineReloadButton } from "./offline-reload-button";

type OfflinePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: OfflinePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "offline" });

  return {
    title: `${t("title")} — BookPrinta`,
    description: t("description"),
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
}

export default async function OfflinePage({ params }: OfflinePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "offline" });

  return (
    <main
      id="main-content"
      aria-labelledby="offline-title"
      className="relative min-h-screen overflow-hidden bg-black px-4 py-6 text-white sm:px-6 sm:py-8"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at top, rgba(0, 126, 255, 0.18), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 24%)",
        }}
      />

      <section className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-between rounded-[2rem] border border-white/10 bg-[#050505] px-6 py-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_32px_120px_rgba(0,0,0,0.55)] sm:px-8 sm:py-10">
        <div>
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-4 py-3">
            <Image
              src="/logo-main-white.png"
              alt="BookPrinta"
              width={180}
              height={48}
              priority
              className="h-8 w-auto sm:h-9"
            />
          </div>

          <div className="mt-14">
            <p className="font-sans text-xs font-semibold tracking-[0.22em] text-white/45 uppercase">
              {t("eyebrow")}
            </p>
            <h1
              id="offline-title"
              className="mt-5 max-w-[8ch] font-display text-[2.8rem] leading-[0.92] font-semibold tracking-[-0.05em] text-white sm:text-[3.5rem]"
            >
              {t("title")}
            </h1>
            <p className="mt-5 max-w-[26ch] font-serif text-lg leading-relaxed text-white/72 sm:text-xl">
              {t("description")}
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <OfflineReloadButton label={t("retry")} />
        </div>
      </section>
    </main>
  );
}
