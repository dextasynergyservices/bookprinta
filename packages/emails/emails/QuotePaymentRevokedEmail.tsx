import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

const SUPPORT_WHATSAPP_URL = "https://wa.me/2348103208297";

interface QuotePaymentRevokedEmailProps {
  locale?: Locale;
  userName: string;
  reason: string;
  customerMessage?: string;
}

export function QuotePaymentRevokedEmail({
  locale = "en",
  userName,
  reason,
  customerMessage,
}: QuotePaymentRevokedEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "quote_payment_revoked", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "quote_payment_revoked", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "quote_payment_revoked", "body")}</Text>

      <Section style={infoBox}>
        <Text style={label}>{t(locale, "quote_payment_revoked", "reason")}</Text>
        <Text style={value}>{reason}</Text>
      </Section>

      {customerMessage ? (
        <Section style={infoBox}>
          <Text style={label}>{t(locale, "quote_payment_revoked", "customer_message")}</Text>
          <Text style={value}>{customerMessage}</Text>
        </Section>
      ) : null}

      <Text style={mutedText}>{t(locale, "quote_payment_revoked", "next_step")}</Text>
      <Section style={ctaSection}>
        <EmailButton href={SUPPORT_WHATSAPP_URL}>
          {t(locale, "quote_payment_revoked", "whatsapp_cta")}
        </EmailButton>
      </Section>
    </EmailLayout>
  );
}

QuotePaymentRevokedEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  reason: "We need to confirm your updated phone number before processing payment.",
  customerMessage: "Please reply with the best phone number linked to your email account.",
};

export default QuotePaymentRevokedEmail;

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
  margin: "0 0 20px",
};

const infoBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "0 0 16px",
  border: "1px solid #ededed",
};

const label: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  margin: "0 0 6px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const value: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#111827",
  margin: "0",
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0",
};

const ctaSection: React.CSSProperties = {
  marginTop: "16px",
};
