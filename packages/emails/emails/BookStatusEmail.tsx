import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface BookStatusEmailProps {
  locale?: Locale;
  userName: string;
  bookTitle: string;
  status: string;
  dashboardUrl: string;
}

const STATUS_KEY_MAP: Record<string, string> = {
  DESIGNING: "status_designing",
  DESIGNED: "status_designed",
  FORMATTING: "status_formatting",
  FORMATTED: "status_formatted",
  REVIEW: "status_review",
  APPROVED: "status_approved",
  PRINTING: "status_printing",
  PRINTED: "status_printed",
  SHIPPING: "status_shipping",
  DELIVERED: "status_delivered",
};

export function BookStatusEmail({
  locale = "en",
  userName,
  bookTitle,
  status,
  dashboardUrl,
}: BookStatusEmailProps) {
  const statusKey = STATUS_KEY_MAP[status] ?? status;
  const statusLabel = t(locale, "book_status", statusKey);

  return (
    <EmailLayout locale={locale} preview={t(locale, "book_status", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "book_status", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "book_status", "body", { bookTitle })}</Text>

      <Section style={statusBox}>
        <Text style={statusLabel_style}>{t(locale, "book_status", "current_status")}</Text>
        <Text style={statusValue}>{statusLabel}</Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={dashboardUrl}>{t(locale, "book_status", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

BookStatusEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  bookTitle: "The Art of Lagos Living",
  status: "PRINTING",
  dashboardUrl: "https://bookprinta.com/dashboard",
};

export default BookStatusEmail;

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

const statusBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  margin: "0 0 24px",
  textAlign: "center" as const,
  border: "1px solid #ededed",
};

const statusLabel_style: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const statusValue: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#007eff",
  margin: "0",
  fontFamily: BRAND.fontDisplay,
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};
