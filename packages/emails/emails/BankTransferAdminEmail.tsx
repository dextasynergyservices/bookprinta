import { Link, Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface BankTransferAdminEmailProps {
  locale?: Locale;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  amount: string;
  orderNumber: string;
  receiptUrl: string;
  adminPanelUrl: string;
}

export function BankTransferAdminEmail({
  locale = "en",
  payerName,
  payerEmail,
  payerPhone,
  amount,
  orderNumber,
  receiptUrl,
  adminPanelUrl,
}: BankTransferAdminEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "bank_transfer_admin", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting_admin")}</Text>
      <EmailHeading>{t(locale, "bank_transfer_admin", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "bank_transfer_admin", "body")}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_admin", "payer_name")}:</span>{" "}
          {payerName}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_admin", "payer_email")}:</span>{" "}
          {payerEmail}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_admin", "payer_phone")}:</span>{" "}
          {payerPhone}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_admin", "amount")}:</span>{" "}
          <span style={amountHighlight}>{amount}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_admin", "order_number")}:</span>{" "}
          {orderNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "bank_transfer_admin", "receipt")}:</span>{" "}
          <Link href={receiptUrl} style={linkStyle}>
            View Receipt
          </Link>
        </Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={adminPanelUrl}>{t(locale, "bank_transfer_admin", "cta")}</EmailButton>
      </Section>

      <Text style={slaWarning}>{t(locale, "bank_transfer_admin", "sla_reminder")}</Text>
    </EmailLayout>
  );
}

BankTransferAdminEmail.PreviewProps = {
  locale: "en" as Locale,
  payerName: "Adaeze Okafor",
  payerEmail: "adaeze@example.com",
  payerPhone: "+234 801 234 5678",
  amount: "N150,000",
  orderNumber: "BP-2026-0001",
  receiptUrl: "https://res.cloudinary.com/bookprinta/image/upload/receipt123.jpg",
  adminPanelUrl: "https://bookprinta.com/admin/payments",
};

export default BankTransferAdminEmail;

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

const amountHighlight: React.CSSProperties = {
  fontWeight: 700,
  color: "#007eff",
};

const linkStyle: React.CSSProperties = {
  color: "#007eff",
  textDecoration: "underline",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const slaWarning: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#dc2626",
  fontWeight: 600,
  textAlign: "center" as const,
  margin: "0",
};
