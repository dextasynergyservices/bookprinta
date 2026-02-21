import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ContactConfirmationEmailProps {
  locale?: Locale;
  firstName: string;
  subject: string;
  subjectLabel: string;
  message: string;
  dashboardUrl?: string;
}

export function ContactConfirmationEmail({
  locale = "en",
  firstName,
  subjectLabel,
  message,
  dashboardUrl = "https://bookprinta.com",
}: ContactConfirmationEmailProps) {
  // Truncate message preview to 200 chars
  const messagePreview = message.length > 200 ? `${message.slice(0, 200)}…` : message;

  return (
    <EmailLayout locale={locale} preview={t(locale, "contact_confirm", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: firstName })}</Text>
      <EmailHeading>{t(locale, "contact_confirm", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "contact_confirm", "body")}</Text>

      {/* Summary of what they submitted */}
      <Section style={summaryBox}>
        <Text style={sectionTitle}>{t(locale, "contact_confirm", "your_message")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "contact_confirm", "subject_label")}:</span>{" "}
          {subjectLabel}
        </Text>
        <Text style={messagePreviewText}>{messagePreview}</Text>
      </Section>

      {/* What happens next */}
      <Section style={stepsSection}>
        <Text style={sectionTitle}>{t(locale, "contact_confirm", "what_next")}</Text>
        <Text style={stepText}>1. {t(locale, "contact_confirm", "step_1")}</Text>
        <Text style={stepText}>2. {t(locale, "contact_confirm", "step_2")}</Text>
        <Text style={stepText}>3. {t(locale, "contact_confirm", "step_3")}</Text>
      </Section>

      {/* CTA */}
      <Section style={ctaSection}>
        <EmailButton href={dashboardUrl}>{t(locale, "contact_confirm", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

ContactConfirmationEmail.PreviewProps = {
  locale: "en" as Locale,
  firstName: "Adaeze",
  subject: "CUSTOM_QUOTE",
  subjectLabel: "Custom Quote",
  message:
    "Hi, I'm interested in publishing a 300-page novel with a hardcover finish. Can you provide a quote? I'd also like to discuss bulk pricing for 500 copies.",
  dashboardUrl: "https://bookprinta.com",
};

export default ContactConfirmationEmail;

const greeting: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: BRAND.darkGray,
  margin: "0 0 8px",
};

const bodyText: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: BRAND.darkGray,
  margin: "0 0 24px",
};

const summaryBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  border: `1px solid ${BRAND.muted}`,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "13px",
  fontWeight: 600,
  color: BRAND.black,
  margin: "0 0 12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const detailRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: BRAND.darkGray,
  margin: "0 0 8px",
};

const detailLabel: React.CSSProperties = {
  fontWeight: 600,
};

const messagePreviewText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: BRAND.mutedText,
  margin: "0",
  fontStyle: "italic",
  whiteSpace: "pre-wrap" as const,
};

const stepsSection: React.CSSProperties = {
  margin: "0 0 24px",
};

const stepText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: BRAND.darkGray,
  margin: "0 0 4px",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};
