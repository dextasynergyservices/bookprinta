import { Section, Text } from "@react-email/components";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface BankTransferRejectedEmailProps {
  locale?: Locale;
  userName: string;
  orderNumber: string;
  paymentReference: string;
  rejectionReason: string;
}

export function BankTransferRejectedEmail({
  locale = "en",
  userName,
  orderNumber,
  paymentReference,
  rejectionReason,
}: BankTransferRejectedEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "bank_transfer_rejected", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "bank_transfer_rejected", "heading")}</EmailHeading>
      <Text style={bodyText}>
        {t(locale, "bank_transfer_rejected", "body", {
          orderNumber,
        })}
      </Text>

      <Section style={summaryBox}>
        <Text style={summaryLabel}>{t(locale, "bank_transfer_rejected", "order_number")}</Text>
        <Text style={summaryValue}>{orderNumber}</Text>

        <Text style={summaryLabel}>{t(locale, "bank_transfer_rejected", "payment_reference")}</Text>
        <Text style={summaryValue}>{paymentReference}</Text>
      </Section>

      <Section style={reasonBox}>
        <Text style={reasonLabel}>{t(locale, "bank_transfer_rejected", "reason")}</Text>
        <Text style={reasonText}>{rejectionReason}</Text>
      </Section>

      <Text style={bodyText}>{t(locale, "bank_transfer_rejected", "next_steps")}</Text>
      <Text style={mutedText}>{t(locale, "bank_transfer_rejected", "support")}</Text>
    </EmailLayout>
  );
}

BankTransferRejectedEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  orderNumber: "BP-2026-0012",
  paymentReference: "BT-2026-0012",
  rejectionReason:
    "We could not match the receipt amount to the pending order, and the transfer confirmation image is unreadable. Please contact support before sending a replacement transfer.",
};

export default BankTransferRejectedEmail;

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

const summaryBox: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  border: "1px solid #e2e8f0",
};

const summaryLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#64748b",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

const summaryValue: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#0f172a",
  margin: "0 0 14px",
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

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0",
};
