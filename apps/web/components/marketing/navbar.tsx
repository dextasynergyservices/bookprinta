"use client";

import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Button } from "@/components/ui/button";
import { useLenis } from "@/hooks/use-lenis";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { MobileDrawer } from "./mobile-drawer";

const navLinks = [
  { href: "/", labelKey: "home" },
  { href: "/pricing", labelKey: "pricing" },
  { href: "/showcase", labelKey: "showcase" },
  { href: "/about", labelKey: "about" },
  { href: "/resources", labelKey: "resources" },
  { href: "/contact", labelKey: "contact" },
] as const;

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { lenis } = useLenis();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Track scroll position via Lenis for background change
  const handleScroll = useCallback(() => {
    if (lenis) {
      setIsScrolled(lenis.scroll > 50);
    }
  }, [lenis]);

  useEffect(() => {
    if (!lenis) return;

    const unsubscribe = lenis.on("scroll", handleScroll);
    // Set initial state
    handleScroll();

    return () => {
      unsubscribe();
    };
  }, [lenis, handleScroll]);

  // Fallback scroll listener for when Lenis is not available (prefers-reduced-motion)
  useEffect(() => {
    if (lenis) return;

    function onScroll() {
      setIsScrolled(window.scrollY > 50);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, [lenis]);

  return (
    <>
      {/* Skip to content — a11y */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <header
        className={cn(
          "fixed top-0 right-0 left-0 z-50 transition-colors duration-300",
          isScrolled
            ? "bg-primary/95 shadow-sm backdrop-blur-md"
            : "bg-white/60 backdrop-blur-md shadow-sm"
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-20 lg:px-8">
          {/* Logo */}
          <Link
            href="/"
            className={cn(
              "font-display shrink-0 text-lg font-bold tracking-tight lg:text-xl transition-colors duration-300",
              isScrolled ? "text-primary-foreground" : "text-foreground"
            )}
            aria-label="BookPrinta — Home"
          >
            BookPrinta
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {navLinks.map(({ href, labelKey }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "font-display relative px-3 py-2 text-sm font-medium tracking-wide transition-colors duration-300",
                    isActive
                      ? "text-accent"
                      : isScrolled
                        ? "text-primary-foreground/70 hover:text-primary-foreground"
                        : "text-foreground/70 hover:text-foreground"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t(labelKey)}
                  {/* Active indicator underline */}
                  {isActive && (
                    <span className="absolute right-3 bottom-0 left-3 h-0.5 rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden items-center gap-2 lg:flex">
            <LanguageSwitcher isScrolled={isScrolled} />
            <Link
              href="/login"
              className={cn(
                "font-display px-3 py-2 text-sm font-medium transition-colors duration-300",
                isScrolled
                  ? "text-primary-foreground/70 hover:text-primary-foreground"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              {t("login")}
            </Link>
            <Button
              asChild
              className="rounded-full bg-accent px-6 font-display text-sm font-semibold text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/contact">{t("get_quote")} &gt;</Link>
            </Button>
          </div>

          {/* Mobile right actions */}
          <div className="flex items-center gap-1 lg:hidden">
            <LanguageSwitcher isScrolled={isScrolled} />
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className={cn(
                "font-display inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 text-sm font-medium transition-colors duration-300",
                isScrolled
                  ? "text-primary-foreground/80 hover:text-primary-foreground"
                  : "text-foreground/80 hover:text-foreground"
              )}
              aria-label="Open navigation menu"
              aria-expanded={isDrawerOpen}
              aria-controls="mobile-nav-drawer"
            >
              <MenuIcon className="size-5" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
