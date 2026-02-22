"use client";

import { GlobeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

const locales = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
] as const;

interface LanguageSwitcherProps {
  isScrolled?: boolean;
}

export function LanguageSwitcher({ isScrolled = true }: LanguageSwitcherProps) {
  const t = useTranslations("language_switcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleLocaleChange(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`size-10 shrink-0 transition-colors duration-300 ${
            isScrolled
              ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
              : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
          }`}
          aria-label={t("label")}
        >
          <GlobeIcon className="size-5" />
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {locales.map(({ code, label }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleLocaleChange(code)}
            className={locale === code ? "bg-accent/10 font-semibold" : ""}
          >
            <span className="mr-2 text-sm uppercase opacity-60">{code}</span>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
