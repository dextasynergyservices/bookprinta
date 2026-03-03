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
  orderNumber?: string;
  packageName?: string;
  amountPaid?: string;
  addons?: string[];
}

export function SignupLinkEmail({
  locale = "en",
  userName,
  signupUrl,
  orderNumber,
  packageName,
  amountPaid,
  addons,
}: SignupLinkEmailProps) {
  const hasAddons = addons && addons.length > 0;
  return (
    <EmailLayout locale={locale} preview={t(locale, "signup_link", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "signup_link", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "signup_link", "requested")}</Text>

      {orderNumber && (
        <Section style={orderBox}>
          <Text style={orderTitle}>{t(locale, "signup_link", "order_summary")}</Text>
          {packageName && (
            <Text style={orderRow}>
              <span style={orderLabel}>{t(locale, "signup_link", "package")}:</span> {packageName}
            </Text>
          )}
          <Text style={orderRow}>
            <span style={orderLabel}>{t(locale, "signup_link", "order_number")}:</span>{" "}
            {orderNumber}
          </Text>
          {amountPaid && (
            <Text style={orderRow}>
              <span style={orderLabel}>{t(locale, "signup_link", "amount_paid")}:</span>{" "}
              {amountPaid}
            </Text>
          )}
          {hasAddons && (
            <Text style={orderRow}>
              <span style={orderLabel}>{t(locale, "signup_link", "addons")}:</span>{" "}
              {addons.join(", ")}
            </Text>
          )}
        </Section>
      )}

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
  orderNumber: "BP-2026-0001",
  packageName: "Glow Up",
  amountPaid: "₦150,000",
  addons: ["Cover Design", "ISBN Registration"],
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
