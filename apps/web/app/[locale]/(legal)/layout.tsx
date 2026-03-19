import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Link } from "@/lib/i18n/navigation";

type LegalLayoutProps = {
  children: ReactNode;
};

export default async function LegalLayout({ children }: LegalLayoutProps) {
  const tCommon = await getTranslations("common");
  const tLegal = await getTranslations("legal");

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:text-foreground focus:shadow-md"
      >
        {tCommon("skip_to_main_content")}
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label={tLegal("home_link_aria")} className="inline-flex items-center">
            <Image
              src="/logo-main-black.png"
              alt=""
              width={146}
              height={28}
              priority
              className="h-7 w-auto"
            />
          </Link>

          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {tLegal("back_to_home")}
          </Link>
        </div>
      </header>

      <main id="main-content" className="relative">
        {children}
      </main>
    </div>
  );
}
