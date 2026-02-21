import { Link, Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ContactAdminEmailProps {
  locale?: Locale;
  fullName: string;
  email: string;
  phone?: string;
  subject: string;
  subjectLabel: string;
  message: string;
  submissionId: string;
  adminPanelUrl: string;
}

export function ContactAdminEmail({
  locale = "en",
  fullName,
  email,
  phone,
  subjectLabel,
  message,
  submissionId,
  adminPanelUrl,
}: ContactAdminEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "contact_admin", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting_admin")}</Text>
      <EmailHeading>{t(locale, "contact_admin", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "contact_admin", "body")}</Text>

      {/* Reference */}
      <Section style={refBox}>
        <Text style={refLabel}>{t(locale, "contact_admin", "reference")}</Text>
        <Text style={refValue}>{submissionId}</Text>
      </Section>

      {/* Contact Info */}
      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "contact_admin", "contact_info")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "contact_admin", "full_name")}:</span> {fullName}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "contact_admin", "email")}:</span>{" "}
          <Link href={`mailto:${email}`} style={linkStyle}>
            {email}
          </Link>
        </Text>
        {phone && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "contact_admin", "phone")}:</span> {phone}
          </Text>
        )}
      </Section>

      {/* Subject + Message */}
      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "contact_admin", "subject_label")}</Text>
        <Text style={detailRow}>{subjectLabel}</Text>
      </Section>

      <Section style={messageBox}>
        <Text style={sectionTitle}>{t(locale, "contact_admin", "message_label")}</Text>
        <Text style={messageText}>{message}</Text>
      </Section>

      {/* CTA */}
      <Section style={ctaSection}>
        <EmailButton href={adminPanelUrl}>{t(locale, "contact_admin", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

ContactAdminEmail.PreviewProps = {
  locale: "en" as Locale,
  fullName: "Adaeze Okafor",
  email: "adaeze@example.com",
  phone: "+234 801 234 5678",
  subject: "CUSTOM_QUOTE",
  subjectLabel: "Custom Quote",
  message:
    "Hi, I'm interested in publishing a 300-page novel with a hardcover finish. Can you provide a quote? I'd also like to discuss bulk pricing for 500 copies.",
  submissionId: "CT-2026-0001",
  adminPanelUrl: "https://bookprinta.com/admin/contact/CT-2026-0001",
};

export default ContactAdminEmail;

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

const refBox: React.CSSProperties = {
  backgroundColor: "#eff6ff",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  textAlign: "center" as const,
  border: `1px solid ${BRAND.accent}40`,
};

const refLabel: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "12px",
  fontWeight: 600,
  color: BRAND.accent,
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const refValue: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: BRAND.black,
  margin: "0",
  fontFamily: BRAND.fontDisplay,
};

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 16px",
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
  margin: "0 0 4px",
};

const detailLabel: React.CSSProperties = {
  fontWeight: 600,
};

const messageBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  border: `1px solid ${BRAND.muted}`,
};

const messageText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: BRAND.darkGray,
  margin: "0",
  whiteSpace: "pre-wrap" as const,
};

const linkStyle: React.CSSProperties = {
  color: BRAND.accent,
  textDecoration: "underline",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};
