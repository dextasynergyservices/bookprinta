"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { TrustBadgesStrip } from "@/components/shared/TrustBadgesStrip";
import { usePublicMarketingSettings } from "@/hooks/usePublicMarketingSettings";
import { Link } from "@/lib/i18n/navigation";

const socialLinks = [
  {
    name: "LinkedIn",
    href: "https://linkedin.com/company/bookprinta",
    labelKey: "linkedin" as const,
    icon: (
      <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "https://instagram.com/bookprinta",
    labelKey: "instagram" as const,
    icon: (
      <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    name: "X",
    href: "https://x.com/bookprinta",
    labelKey: "twitter" as const,
    icon: (
      <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

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

  const socialLinkHrefMap = new Map(
    managedSocialLinks.map((entry) => [entry.label.trim().toLowerCase(), entry.url.trim()])
  );

  const resolveSocialHref = (fallbackHref: string, socialName: string): string => {
    const lowerName = socialName.toLowerCase();

    for (const [label, href] of socialLinkHrefMap.entries()) {
      if (label.includes(lowerName)) {
        return href;
      }
    }

    return fallbackHref;
  };

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
              <div className="flex gap-3">
                {socialLinks.map(({ name, href, labelKey, icon }) => (
                  <a
                    key={name}
                    href={resolveSocialHref(href, name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-10 items-center justify-center rounded-full border border-white/10 text-primary-foreground/60 transition-colors hover:border-primary-foreground hover:text-primary-foreground"
                    aria-label={t(labelKey)}
                  >
                    {icon}
                  </a>
                ))}
              </div>
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
