import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface SignupVerificationEmailProps {
  locale?: Locale;
  userName: string;
  verificationCode: string;
  verificationToken: string;
  verificationUrl: string;
}

export function SignupVerificationEmail({
  locale = "en",
  userName,
  verificationCode,
  verificationToken,
  verificationUrl,
}: SignupVerificationEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "signup_verification", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "signup_verification", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "signup_verification", "body")}</Text>

      <Section style={codeSection}>
        <Text style={labelText}>{t(locale, "signup_verification", "code_label")}</Text>
        <Text style={codeText}>{verificationCode}</Text>
      </Section>

      <Section style={tokenSection}>
        <Text style={labelText}>{t(locale, "signup_verification", "token_label")}</Text>
        <Text style={tokenText}>{verificationToken}</Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={verificationUrl}>{t(locale, "signup_verification", "cta")}</EmailButton>
      </Section>

      <Text style={mutedText}>{t(locale, "signup_verification", "expires")}</Text>
    </EmailLayout>
  );
}

SignupVerificationEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  verificationCode: "493821",
  verificationToken: "xyz789token123",
  verificationUrl: "https://bookprinta.com/signup/finish?token=xyz789token123",
};

export default SignupVerificationEmail;

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

const codeSection: React.CSSProperties = {
  backgroundColor: "#f8fbff",
  border: "1px solid #dbeafe",
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "0 0 14px",
};

const tokenSection: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: "1px solid #ededed",
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "0 0 14px",
};

const labelText: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#6b7280",
  margin: "0 0 6px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const codeText: React.CSSProperties = {
  fontSize: "24px",
  lineHeight: "30px",
  color: "#007eff",
  margin: "0",
  fontWeight: 700,
  letterSpacing: "0.2em",
  fontFamily: "'Poppins', Helvetica, Arial, sans-serif",
};

const tokenText: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "20px",
  color: "#374151",
  margin: "0",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  wordBreak: "break-all",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "20px 0",
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0",
};
