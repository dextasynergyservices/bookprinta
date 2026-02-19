import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ManuscriptRejectedEmailProps {
  locale?: Locale;
  userName: string;
  bookTitle: string;
  rejectionReason: string;
  dashboardUrl: string;
}

export function ManuscriptRejectedEmail({
  locale = "en",
  userName,
  bookTitle,
  rejectionReason,
  dashboardUrl,
}: ManuscriptRejectedEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "manuscript_rejected", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "manuscript_rejected", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "manuscript_rejected", "body", { bookTitle })}</Text>

      <Section style={reasonBox}>
        <Text style={reasonLabel}>{t(locale, "manuscript_rejected", "reason")}</Text>
        <Text style={reasonText}>{rejectionReason}</Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={dashboardUrl}>{t(locale, "manuscript_rejected", "cta")}</EmailButton>
      </Section>

      <Text style={mutedText}>{t(locale, "manuscript_rejected", "support")}</Text>
    </EmailLayout>
  );
}

ManuscriptRejectedEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  bookTitle: "The Art of Lagos Living",
  rejectionReason:
    "The manuscript contains several formatting issues: inconsistent chapter headings, missing page breaks between chapters, and some images are embedded at too low a resolution for print quality. Please reformat chapter headings consistently and ensure all images are at least 300 DPI.",
  dashboardUrl: "https://bookprinta.com/dashboard",
};

export default ManuscriptRejectedEmail;

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

const reasonBox: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  borderLeft: "4px solid #ef4444",
};

const reasonLabel: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#991b1b",
  margin: "0 0 8px",
};

const reasonText: React.CSSProperties = {
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
