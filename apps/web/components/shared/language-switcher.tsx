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
import { cn } from "@/lib/utils";

const locales = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
] as const;

interface LanguageSwitcherProps {
  isScrolled?: boolean;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  selectedLocale?: string;
  onLocaleChange?: (newLocale: string) => Promise<void> | void;
}

export function LanguageSwitcher({
  isScrolled = true,
  compact = false,
  className,
  disabled = false,
  selectedLocale,
  onLocaleChange,
}: LanguageSwitcherProps) {
  const t = useTranslations("language_switcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const activeLocale = selectedLocale ?? locale;

  async function handleLocaleChange(newLocale: string) {
    if (disabled || newLocale === activeLocale) {
      return;
    }

    try {
      await onLocaleChange?.(newLocale);
    } catch {
      return;
    }

    router.replace(pathname, { locale: newLocale });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            compact ? "size-9 min-h-9 min-w-9" : "size-10",
            "shrink-0 transition-colors duration-300",
            isScrolled
              ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
              : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10",
            className
          )}
          disabled={disabled}
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
            onClick={() => {
              void handleLocaleChange(code);
            }}
            disabled={disabled || activeLocale === code}
            className={activeLocale === code ? "bg-accent/10 font-semibold" : ""}
          >
            <span className="mr-2 text-sm uppercase opacity-60">{code}</span>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
