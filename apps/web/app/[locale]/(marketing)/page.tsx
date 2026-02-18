import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  return <HomePageContent params={params} />;
}

async function HomePageContent({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeView />;
}

function HomeView() {
  const t = useTranslations("hero");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight text-primary md:text-6xl lg:text-7xl">
        {t("title")}
      </h1>
      <p className="mt-6 max-w-2xl font-serif text-lg text-secondary md:text-xl">{t("subtitle")}</p>
      <button
        type="button"
        className="mt-10 rounded-full bg-accent px-8 py-4 text-base font-semibold text-primary-light transition-opacity hover:opacity-90"
      >
        {t("cta")}
      </button>
    </div>
  );
}
