import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface SignupLinkEmailProps {
  locale?: Locale;
  userName: string;
  signupUrl: string;
}

export function SignupLinkEmail({ locale = "en", userName, signupUrl }: SignupLinkEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "signup_link", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "signup_link", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "signup_link", "requested")}</Text>
      <Text style={bodyText}>{t(locale, "signup_link", "body")}</Text>

      <Section style={ctaSection}>
        <EmailButton href={signupUrl}>{t(locale, "signup_link", "cta")}</EmailButton>
      </Section>

      <Text style={mutedText}>{t(locale, "signup_link", "expires")}</Text>
    </EmailLayout>
  );
}

SignupLinkEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  signupUrl: "https://bookprinta.com/signup/finish?token=xyz789",
};

export default SignupLinkEmail;

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
  margin: "0 0 16px",
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
