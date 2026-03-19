import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  LegalDocument,
  type LegalDocumentSectionData,
} from "@/components/shared/legal/legal-document";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";

type RefundPolicyPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

function buildLocalizedPath(locale: string, pathname: "/refund-policy") {
  return locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;
}

export async function generateMetadata({ params }: RefundPolicyPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.refund_policy" });
  const canonical = buildLocalizedPath(locale, "/refund-policy");

  return {
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical,
      languages: {
        en: "/refund-policy",
        fr: "/fr/refund-policy",
        es: "/es/refund-policy",
      },
    },
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      url: canonical,
      type: "article",
    },
  };
}

export default async function RefundPolicyPage({ params }: RefundPolicyPageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const tLegal = await getTranslations({ locale, namespace: "legal" });
  const tRefund = await getTranslations({ locale, namespace: "legal.refund_policy" });
  const tDashboard = await getTranslations({ locale, namespace: "dashboard" });
  const tAdmin = await getTranslations({ locale, namespace: "admin" });

  const policyRows = [
    {
      stage: tDashboard("order_tracking_refund_policy_rule_before_processing"),
      amount: tDashboard("order_tracking_refund_policy_rule_before_processing_amount"),
      amountClassName: "text-foreground",
    },
    {
      stage: tDashboard("order_tracking_refund_policy_rule_ai_processing"),
      amount: tDashboard("order_tracking_refund_policy_rule_ai_processing_amount"),
      amountClassName: "text-accent",
    },
    {
      stage: tDashboard("order_tracking_refund_policy_rule_after_approval"),
      amount: tDashboard("order_tracking_refund_policy_rule_after_approval_amount"),
      amountClassName: "text-destructive",
    },
    {
      stage: tDashboard("order_tracking_refund_policy_rule_after_printing"),
      amount: tDashboard("order_tracking_refund_policy_rule_after_printing_amount"),
      amountClassName: "text-destructive",
    },
  ] as const;

  const sections: LegalDocumentSectionData[] = [
    {
      id: "eligibility-by-stage",
      title: tRefund("sections.eligibility.title"),
      bodyClassName: "space-y-5",
      content: (
        <>
          <p className="font-serif text-[1.02rem] leading-8 text-foreground/80 sm:text-[1.08rem]">
            {tDashboard("order_tracking_refund_policy_modal_intro")}
          </p>

          <div className="overflow-hidden rounded-[1.5rem] border border-border bg-muted/30">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-border bg-muted/60 px-4 py-3 sm:px-5">
              <p className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tDashboard("order_tracking_refund_policy_stage_header")}
              </p>
              <p className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tDashboard("order_tracking_refund_policy_amount_header")}
              </p>
            </div>

            <div className="divide-y divide-border">
              {policyRows.map((row) => (
                <div
                  key={row.stage}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-4 sm:px-5"
                >
                  <p className="font-serif text-[1rem] leading-7 text-foreground/80 sm:text-[1.04rem]">
                    {row.stage}
                  </p>
                  <p
                    className={`font-sans text-sm font-semibold uppercase tracking-[0.12em] ${row.amountClassName}`}
                  >
                    {row.amount}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      ),
    },
    {
      id: "support-review",
      title: tRefund("sections.support.title"),
      bodyClassName: "space-y-5",
      content: (
        <>
          <p className="font-serif text-[1.02rem] leading-8 text-foreground/80 sm:text-[1.08rem]">
            {tDashboard("order_tracking_refund_policy_modal_support")}
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-sans text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent"
            >
              {tDashboard("order_tracking_refund_policy_modal_contact")}
            </Link>
          </div>
        </>
      ),
    },
  ];

  return (
    <LegalDocument
      className="pb-16 pt-8 sm:pb-20 sm:pt-10 lg:pb-24 lg:pt-12"
      title={tRefund("title")}
      lastUpdatedLabel={tLegal("last_updated_label")}
      lastUpdatedDate={tRefund("last_updated_date")}
      intro={[
        {
          id: "intro-subtitle",
          content: tDashboard("order_tracking_refund_policy_modal_subtitle"),
        },
        {
          id: "intro-policy-description",
          content: tAdmin("orders_detail_policy_description"),
        },
      ]}
      sections={sections}
    />
  );
}
