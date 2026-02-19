import { Section, Text } from "@react-email/components";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface RefundConfirmEmailProps {
  locale?: Locale;
  userName: string;
  orderNumber: string;
  originalAmount: string;
  refundAmount: string;
  refundReason: string;
}

export function RefundConfirmEmail({
  locale = "en",
  userName,
  orderNumber,
  originalAmount,
  refundAmount,
  refundReason,
}: RefundConfirmEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "refund_confirm", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "refund_confirm", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "refund_confirm", "body")}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "refund_confirm", "order_number")}:</span>{" "}
          {orderNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "refund_confirm", "original_amount")}:</span>{" "}
          {originalAmount}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "refund_confirm", "refund_amount")}:</span>{" "}
          <span style={refundHighlight}>{refundAmount}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "refund_confirm", "refund_reason")}:</span>{" "}
          {refundReason}
        </Text>
      </Section>

      <Text style={mutedText}>{t(locale, "refund_confirm", "processing_time")}</Text>
    </EmailLayout>
  );
}

RefundConfirmEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  orderNumber: "BP-2026-0001",
  originalAmount: "N150,000",
  refundAmount: "N105,000",
  refundReason: "Partial refund - processing had already started",
};

export default RefundConfirmEmail;

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

const refundHighlight: React.CSSProperties = {
  color: "#007eff",
  fontWeight: 600,
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0",
};
