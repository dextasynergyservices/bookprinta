import { Section, Text } from "@react-email/components";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface BankTransferUserEmailProps {
  locale?: Locale;
  userName: string;
  orderNumber: string;
  amount: string;
}

export function BankTransferUserEmail({
  locale = "en",
  userName,
  orderNumber,
  amount,
}: BankTransferUserEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "bank_transfer_user", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "bank_transfer_user", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "bank_transfer_user", "body")}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_user", "order_number")}:</span>{" "}
          {orderNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_user", "amount")}:</span> {amount}
        </Text>
      </Section>

      <Text style={subheading}>{t(locale, "bank_transfer_user", "what_next")}</Text>
      <Section style={stepsList}>
        <Text style={stepItem}>1. {t(locale, "bank_transfer_user", "step_1")}</Text>
        <Text style={stepItem}>2. {t(locale, "bank_transfer_user", "step_2")}</Text>
        <Text style={stepItem}>3. {t(locale, "bank_transfer_user", "step_3")}</Text>
      </Section>

      <Text style={mutedText}>{t(locale, "bank_transfer_user", "patience")}</Text>
    </EmailLayout>
  );
}

BankTransferUserEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  orderNumber: "BP-2026-0001",
  amount: "N150,000",
};

export default BankTransferUserEmail;

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

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  border: "1px solid #ededed",
};

const detailRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#2A2A2A",
  margin: "0 0 4px",
};

const detailLabel: React.CSSProperties = {
  fontWeight: 600,
};

const subheading: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#000000",
  margin: "0 0 12px",
};

const stepsList: React.CSSProperties = {
  padding: "0",
};

const stepItem: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#2A2A2A",
  margin: "0 0 8px",
  paddingLeft: "4px",
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "16px 0 0",
};
