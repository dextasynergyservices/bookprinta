import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface WelcomeEmailProps {
  locale?: Locale;
  userName: string;
  signupUrl: string;
  orderNumber?: string;
  packageName?: string;
  amountPaid?: string;
}

export function WelcomeEmail({
  locale = "en",
  userName,
  signupUrl,
  orderNumber,
  packageName,
  amountPaid,
}: WelcomeEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "welcome", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "welcome", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "welcome", "body")}</Text>

      {orderNumber && (
        <Section style={orderBox}>
          <Text style={orderTitle}>{t(locale, "welcome", "order_summary")}</Text>
          {packageName && (
            <Text style={orderRow}>
              <span style={orderLabel}>{t(locale, "welcome", "package")}:</span> {packageName}
            </Text>
          )}
          <Text style={orderRow}>
            <span style={orderLabel}>{t(locale, "welcome", "order_number")}:</span> {orderNumber}
          </Text>
          {amountPaid && (
            <Text style={orderRow}>
              <span style={orderLabel}>{t(locale, "welcome", "amount_paid")}:</span> {amountPaid}
            </Text>
          )}
        </Section>
      )}

      <Section style={ctaSection}>
        <EmailButton href={signupUrl}>{t(locale, "welcome", "cta")}</EmailButton>
      </Section>

      <Text style={mutedText}>{t(locale, "welcome", "expires")}</Text>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  signupUrl: "https://bookprinta.com/signup/finish?token=abc123",
  orderNumber: "BP-2026-0001",
  packageName: "Glow Up",
  amountPaid: "N150,000",
};

export default WelcomeEmail;

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

const orderBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  border: "1px solid #ededed",
};

const orderTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#000000",
  margin: "0 0 12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const orderRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2A2A2A",
  margin: "0 0 4px",
};

const orderLabel: React.CSSProperties = {
  fontWeight: 600,
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
