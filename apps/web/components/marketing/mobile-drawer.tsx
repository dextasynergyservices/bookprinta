"use client";

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLenis } from "@/hooks/use-lenis";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  dashboardHref: "/dashboard" | "/admin";
  onLogout: () => Promise<void>;
  isLoggingOut: boolean;
}

const navLinks = [
  { href: "/", labelKey: "home" },
  { href: "/pricing", labelKey: "pricing" },
  { href: "/showcase", labelKey: "showcase" },
  { href: "/contact", labelKey: "contact" },
] as const;

const resourcesDropdownLinks = [
  { href: "/about", labelKey: "about" },
  { href: "/resources", labelKey: "blog" },
] as const;

export function MobileDrawer({
  isOpen,
  onClose,
  isAuthenticated,
  dashboardHref,
  onLogout,
  isLoggingOut,
}: MobileDrawerProps) {
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
          <Link href="/" onClick={onClose} className="shrink-0" aria-label="BookPrinta Home">
            <Image
              src="/logo-main-white.png"
              alt="BookPrinta"
              width={180}
              height={48}
              priority
              className="h-8 w-auto"
            />
          </Link>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="font-display min-h-[44px] min-w-[44px] text-sm font-medium tracking-wide text-white/95 transition-colors hover:text-white"
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
          <MobileNavList pathname={pathname} onClose={onClose} t={t} />
        </nav>

        {/* Bottom CTAs */}
        <div className="mt-auto border-t border-white/10 px-6 py-6">
          <Link
            href="/quote"
            onClick={onClose}
            className="font-display mb-4 block w-full rounded-full bg-accent py-4 text-center text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            {t("get_quote")} &gt;
          </Link>
          {isAuthenticated ? (
            <>
              <Link
                href={dashboardHref}
                onClick={onClose}
                className="font-display block w-full py-3 text-center text-sm font-medium text-white/95 transition-colors hover:text-white"
              >
                {t("dashboard")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void onLogout();
                }}
                disabled={isLoggingOut}
                className="font-display block min-h-[44px] w-full py-3 text-center text-sm font-medium text-white/95 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? t("logout_loading") : t("logout")}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="font-display block w-full py-3 text-center text-sm font-medium text-white/95 transition-colors hover:text-white"
            >
              {t("login")}
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Mobile nav list with collapsible Resources ─── */
function MobileNavList({
  pathname,
  onClose,
  t,
}: {
  pathname: string;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const isResourcesChildActive = resourcesDropdownLinks.some(({ href }) => pathname === href);

  return (
    <ul className="space-y-2">
      {navLinks.map(({ href, labelKey }) => {
        const isActive = pathname === href;

        // Insert Resources dropdown before Contact
        if (labelKey === "contact") {
          return (
            <li key="resources-group-and-contact">
              {/* Resources collapsible */}
              <li>
                <button
                  type="button"
                  onClick={() => setResourcesOpen((prev) => !prev)}
                  className={cn(
                    "font-display flex w-full items-center gap-2 py-3 text-3xl font-bold tracking-tight transition-colors md:text-4xl",
                    isResourcesChildActive ? "text-accent" : "text-white/95 hover:text-white"
                  )}
                >
                  {t("resources")}.
                  <ChevronDown
                    className={cn(
                      "size-6 transition-transform duration-200",
                      resourcesOpen && "rotate-180"
                    )}
                  />
                </button>
                {resourcesOpen && (
                  <ul className="ml-4 space-y-1 border-l border-white/10 pl-4">
                    {resourcesDropdownLinks.map((sub) => {
                      const subActive = pathname === sub.href;
                      return (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            onClick={onClose}
                            className={cn(
                              "font-display block py-2 text-2xl font-semibold tracking-tight transition-colors md:text-3xl",
                              subActive ? "text-accent" : "text-white/70 hover:text-white"
                            )}
                          >
                            {t(sub.labelKey)}.
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>

              {/* Contact (original position) */}
              <li>
                <Link
                  href={href}
                  onClick={onClose}
                  className={cn(
                    "font-display block py-3 text-3xl font-bold tracking-tight transition-colors md:text-4xl",
                    isActive ? "text-accent" : "text-white/95 hover:text-white"
                  )}
                >
                  {t(labelKey)}.
                </Link>
              </li>
            </li>
          );
        }

        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onClose}
              className={cn(
                "font-display block py-3 text-3xl font-bold tracking-tight transition-colors md:text-4xl",
                isActive ? "text-accent" : "text-white/95 hover:text-white"
              )}
            >
              {t(labelKey)}.
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
