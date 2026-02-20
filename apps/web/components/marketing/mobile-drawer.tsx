"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLenis } from "@/hooks/use-lenis";
import { Link, usePathname } from "@/lib/i18n/navigation";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const navLinks = [
  { href: "/", labelKey: "home" },
  { href: "/pricing", labelKey: "pricing" },
  { href: "/showcase", labelKey: "showcase" },
  { href: "/about", labelKey: "about" },
  { href: "/resources", labelKey: "resources" },
  { href: "/faq", labelKey: "faq" },
  { href: "/contact", labelKey: "contact" },
] as const;

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { lenis } = useLenis();

  // Lock/unlock Lenis scroll when drawer opens/closes
  useEffect(() => {
    if (isOpen) {
      lenis?.stop();
    } else {
      lenis?.start();
    }

    return () => {
      lenis?.start();
    };
  }, [isOpen, lenis]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-full max-w-none border-none bg-primary p-0 sm:max-w-none"
        data-lenis-prevent
      >
        {/* Accessible title (visually hidden) */}
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>

        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 pt-6">
          {/* Logo */}
          <Link
            href="/"
            onClick={onClose}
            className="font-display text-xl font-bold tracking-tight text-primary-foreground"
            aria-label="BookPrinta Home"
          >
            BookPrinta
          </Link>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="font-display min-h-[44px] min-w-[44px] text-sm font-medium tracking-wide text-primary-foreground/80 transition-colors hover:text-primary-foreground"
            aria-label="Close navigation menu"
          >
            Close &gt;
          </button>
        </div>

        {/* Navigation links */}
        <nav
          className="flex flex-1 flex-col justify-center px-6 py-8"
          aria-label="Mobile navigation"
        >
          <ul className="space-y-2">
            {navLinks.map(({ href, labelKey }) => {
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={`font-display block py-3 text-3xl font-bold tracking-tight transition-colors md:text-4xl ${
                      isActive
                        ? "text-accent"
                        : "text-primary-foreground/70 hover:text-primary-foreground"
                    }`}
                  >
                    {t(labelKey)}.
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom CTAs */}
        <div className="mt-auto border-t border-white/10 px-6 py-6">
          <Link
            href="/contact"
            onClick={onClose}
            className="font-display mb-4 block w-full rounded-full bg-accent py-4 text-center text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            {t("get_quote")} &gt;
          </Link>
          <Link
            href="/login"
            onClick={onClose}
            className="font-display block w-full py-3 text-center text-sm font-medium text-primary-foreground/60 transition-colors hover:text-primary-foreground"
          >
            {t("login")}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
