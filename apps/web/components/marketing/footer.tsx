"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  FOOTER_FALLBACK_SOCIAL_LINKS,
  MarketingSocialLinkList,
} from "@/components/marketing/social-link-list";
import { TrustBadgesStrip } from "@/components/shared/TrustBadgesStrip";
import { usePublicMarketingSettings } from "@/hooks/usePublicMarketingSettings";
import { Link } from "@/lib/i18n/navigation";

const legalLinks = [
  { href: "/privacy", labelKey: "privacy" },
  { href: "/terms", labelKey: "terms" },
  { href: "/cookies", labelKey: "cookies" },
  { href: "/refund-policy", labelKey: "refund_policy" },
] as const;

export function Footer() {
  const t = useTranslations("footer");
  const { settings } = usePublicMarketingSettings();

  const supportEmail = settings?.businessProfile.supportEmail?.trim() || t("email");
  const supportPhone = settings?.businessProfile.supportPhone?.trim() || t("phone");
  const officeAddress = settings?.businessProfile.officeAddress?.trim() || t("address");
  const managedSocialLinks = settings?.businessProfile.socialLinks ?? [];

  return (
    <footer className="relative bg-primary text-primary-foreground">
      {/* ── Background pattern ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "url(https://res.cloudinary.com/dxoorukfj/image/upload/v1774276632/bg_-_bp_v39dky.png)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* ─── CTA Section — "Say hello" ─── */}
      <div className="relative border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            {t("say_hello")}
          </h2>
          <p className="mt-4 max-w-lg text-base text-primary-foreground/60 lg:text-lg">
            {t("cta_description")}
          </p>
          <Link
            href="/contact"
            className="font-display mt-8 inline-block rounded-full border border-primary-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide transition-colors hover:bg-primary-foreground hover:text-primary"
          >
            {t("contact_cta")} &gt;
          </Link>
        </div>
      </div>

      {/* ─── Links + Info Grid ─── */}
      <div className="relative border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
          {/* Logo */}
          <div className="mb-10">
            <Link href="/" aria-label="BookPrinta home">
              <Image
                src="/logo-main-white.png"
                alt="BookPrinta"
                width={154}
                height={42}
                className="h-8 w-auto"
              />
            </Link>
          </div>

          <TrustBadgesStrip
            compact
            borderless
            securePaymentsLabel={t("trust_secure_payments")}
            qualityPrintsLabel={t("trust_quality_prints")}
            className="mb-10"
          />

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Pages column */}
            <div>
              <h3 className="font-display mb-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground/40">
                {t("pages_heading")}
              </h3>
              <ul className="space-y-1">
                {[
                  { href: "/", labelKey: "link_home" },
                  { href: "/pricing", labelKey: "link_pricing" },
                  { href: "/showcase", labelKey: "link_showcase" },
                  { href: "/about", labelKey: "link_about" },
                ].map(({ href, labelKey }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-primary-foreground/60 transition-colors hover:text-primary-foreground"
                    >
                      {t(labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <h3 className="font-display mb-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground/40">
                {t("resources_heading")}
              </h3>
              <ul className="space-y-1">
                {[
                  { href: "/resources", labelKey: "link_resources" },
                  { href: "/faq", labelKey: "link_faq" },
                  { href: "/contact", labelKey: "link_contact" },
                ].map(({ href, labelKey }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-primary-foreground/60 transition-colors hover:text-primary-foreground"
                    >
                      {t(labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact column */}
            <div>
              <h3 className="font-display mb-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground/40">
                {t("say_hello_label")}
              </h3>
              <address className="space-y-1 not-italic">
                <p className="text-sm text-primary-foreground/60">{officeAddress}</p>
                <p className="text-sm text-primary-foreground/60">
                  <a
                    href={`tel:${supportPhone.replace(/\s/g, "")}`}
                    className="transition-colors hover:text-primary-foreground"
                  >
                    {supportPhone}
                  </a>
                </p>
                <p className="text-sm">
                  <a
                    href={`mailto:${supportEmail}`}
                    className="text-primary-foreground/60 transition-colors hover:text-primary-foreground"
                  >
                    {supportEmail}
                  </a>
                </p>
              </address>
            </div>

            {/* Social column */}
            <div>
              <h3 className="font-display mb-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground/40">
                {t("follow_heading")}
              </h3>
              <MarketingSocialLinkList
                links={managedSocialLinks}
                fallbackLinks={FOOTER_FALLBACK_SOCIAL_LINKS}
                className="flex gap-3"
                linkClassName="border border-white/10 text-primary-foreground/60 hover:border-primary-foreground hover:text-primary-foreground"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom Bar — Legal + Company number ─── */}
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-5 md:flex-row lg:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {legalLinks.map(({ href, labelKey }) => (
              <Link
                key={href}
                href={href}
                className="text-xs text-primary-foreground/40 transition-colors hover:text-primary-foreground"
              >
                {t(labelKey)}
              </Link>
            ))}
          </div>
          <p className="text-xs text-primary-foreground/30">{t("company_number")}</p>
        </div>
      </div>
    </footer>
  );
}
