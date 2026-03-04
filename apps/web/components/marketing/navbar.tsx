"use client";

import { CircleUserRound, LayoutDashboard, LogOut, MenuIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useLenis } from "@/hooks/use-lenis";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
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

function isAdminRole(role: string | undefined) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const { lenis } = useLenis();
  const { user, isAuthenticated, logout, isLoggingOut } = useAuthSession();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const dashboardHref = useMemo(
    () => (isAdminRole(user?.role) ? "/admin" : "/dashboard"),
    [user?.role]
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      toast.success(t("logout_success"));
      setIsDrawerOpen(false);
      router.replace("/");
    } catch {
      toast.error(t("logout_error"));
    }
  }, [logout, router, t]);

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
          "fixed top-0 right-0 left-0 z-50 transition-all duration-300",
          isScrolled ? "bg-primary/95 shadow-sm backdrop-blur-md" : "bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-20 lg:px-8">
          {/* Logo */}
          <Link href="/" className="shrink-0" aria-label="BookPrinta — Home">
            <Image
              src="/logo-main-white.png"
              alt="BookPrinta"
              width={180}
              height={48}
              priority
              className="h-8 w-auto lg:h-10"
            />
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
                    isActive ? "text-accent" : "text-dexta hover:text-accent"
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
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-primary-foreground transition-colors duration-300 hover:bg-white/10"
                    )}
                    aria-label={t("account_menu_aria")}
                  >
                    <CircleUserRound className="size-5" />
                    <span className="sr-only">{t("account_menu_aria")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 border-white/10 bg-[#050505] text-white"
                >
                  <DropdownMenuItem asChild className="font-sans">
                    <Link href={dashboardHref}>
                      <LayoutDashboard className="size-4" />
                      {t("dashboard")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="font-sans"
                    disabled={isLoggingOut}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleLogout();
                    }}
                  >
                    <LogOut className="size-4" />
                    {isLoggingOut ? t("logout_loading") : t("logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href="/login"
                className={cn(
                  "font-display px-3 py-2 text-sm font-medium transition-colors duration-300",
                  "text-primary-foreground hover:text-primary-foreground"
                )}
              >
                {t("login")}
              </Link>
            )}
            <Button
              asChild
              className="rounded-full bg-accent px-6 font-display text-sm font-semibold text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/quote">{t("get_quote")} &gt;</Link>
            </Button>
          </div>

          {/* Mobile right actions */}
          <div className="flex items-center gap-1 lg:hidden">
            <LanguageSwitcher isScrolled={isScrolled} />
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-primary-foreground/90 transition-colors duration-300 hover:bg-white/10 hover:text-primary-foreground"
                    )}
                    aria-label={t("account_menu_aria")}
                  >
                    <CircleUserRound className="size-5" />
                    <span className="sr-only">{t("account_menu_aria")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 border-white/10 bg-[#050505] text-white"
                >
                  <DropdownMenuItem asChild className="font-sans">
                    <Link href={dashboardHref}>
                      <LayoutDashboard className="size-4" />
                      {t("dashboard")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="font-sans"
                    disabled={isLoggingOut}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleLogout();
                    }}
                  >
                    <LogOut className="size-4" />
                    {isLoggingOut ? t("logout_loading") : t("logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href="/login"
                className={cn(
                  "font-display min-h-[44px] inline-flex items-center px-2 text-sm font-medium transition-colors duration-300",
                  "text-primary-foreground/90 hover:text-primary-foreground"
                )}
              >
                {t("login")}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className={cn(
                "font-display inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 text-sm font-medium transition-colors duration-300",
                isScrolled
                  ? "text-dexta hover:text-primary-foreground"
                  : "text-primary-foreground/80 hover:text-primary-foreground"
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
      <MobileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        isAuthenticated={isAuthenticated}
        dashboardHref={dashboardHref}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
      />
    </>
  );
}
