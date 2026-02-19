import { Link, Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface QuoteProposalEmailProps {
  locale?: Locale;
  userName: string;
  totalPrice: string;
  paymentUrl: string;
  proposalPdfUrl?: string;
  adminNotes?: string;
}

export function QuoteProposalEmail({
  locale = "en",
  userName,
  totalPrice,
  paymentUrl,
  proposalPdfUrl,
  adminNotes,
}: QuoteProposalEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "quote_proposal", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "quote_proposal", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "quote_proposal", "body")}</Text>

      <Section style={priceBox}>
        <Text style={priceLabel}>{t(locale, "quote_proposal", "total_price")}</Text>
        <Text style={priceValue}>{totalPrice}</Text>
      </Section>

      {proposalPdfUrl && (
        <Section style={proposalBox}>
          <Link href={proposalPdfUrl} style={proposalLink}>
            {t(locale, "quote_proposal", "view_proposal")}
          </Link>
        </Section>
      )}

      {adminNotes && (
        <Section style={notesBox}>
          <Text style={notesLabel}>{t(locale, "quote_proposal", "admin_notes")}</Text>
          <Text style={notesText}>{adminNotes}</Text>
        </Section>
      )}

      <Section style={ctaSection}>
        <EmailButton href={paymentUrl}>{t(locale, "quote_proposal", "cta")}</EmailButton>
      </Section>

      <Text style={mutedText}>{t(locale, "quote_proposal", "valid_until")}</Text>
    </EmailLayout>
  );
}

QuoteProposalEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  totalPrice: "N250,000",
  paymentUrl: "https://bookprinta.com/checkout?quote=CQ-2026-0042",
  proposalPdfUrl: "https://res.cloudinary.com/bookprinta/raw/upload/proposals/CQ-2026-0042.pdf",
  adminNotes:
    "We recommend the Legacy package for your 400-page manuscript. This includes premium cover design and formatting.",
};

export default QuoteProposalEmail;

const greeting: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2A2A2A",
  margin: "0 0 8px",
};

const bodyText: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2A2A2A",
  margin: "0 0 24px",
};

const priceBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  margin: "0 0 24px",
  textAlign: "center" as const,
  border: "1px solid #ededed",
};

const priceLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const priceValue: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  color: "#000000",
  margin: "0",
  fontFamily: BRAND.fontDisplay,
};

const notesBox: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  borderLeft: "4px solid #f59e0b",
};

const proposalBox: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "0 0 24px",
};

const proposalLink: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "14px",
  color: BRAND.accent,
  textDecoration: "underline",
  fontWeight: 600,
};

const notesLabel: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#92400e",
  margin: "0 0 8px",
};

const notesText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2A2A2A",
  margin: "0",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0",
};
