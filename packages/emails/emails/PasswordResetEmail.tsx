import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface PasswordResetEmailProps {
  locale?: Locale;
  userName: string;
  resetUrl: string;
}

export function PasswordResetEmail({ locale = "en", userName, resetUrl }: PasswordResetEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "password_reset", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "password_reset", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "password_reset", "body")}</Text>

      <Section style={ctaSection}>
        <EmailButton href={resetUrl}>{t(locale, "password_reset", "cta")}</EmailButton>
      </Section>

      <Text style={mutedText}>{t(locale, "password_reset", "expires")}</Text>
      <Text style={mutedText}>{t(locale, "password_reset", "ignore")}</Text>
    </EmailLayout>
  );
}

PasswordResetEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  resetUrl: "https://bookprinta.com/reset-password?token=abc123",
};

export default PasswordResetEmail;

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

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0 0 8px",
};
