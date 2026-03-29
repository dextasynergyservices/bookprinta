import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ReprintAdminConfirmEmailProps {
  locale?: Locale;
  userName: string;
  userEmail: string;
  orderNumber: string;
  bookTitle: string;
  copies: number;
  costPerCopy: string;
  pageSize: string;
  paperColor: string;
  lamination: string;
  totalPrice: string;
  adminPanelUrl: string;
}

export function ReprintAdminConfirmEmail({
  locale = "en",
  userName,
  userEmail,
  orderNumber,
  bookTitle,
  copies,
  costPerCopy,
  pageSize,
  paperColor,
  lamination,
  totalPrice,
  adminPanelUrl,
}: ReprintAdminConfirmEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "reprint_admin", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting_admin")}</Text>
      <EmailHeading>{t(locale, "reprint_admin", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "reprint_admin", "body")}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "order_number")}:</span>{" "}
          {orderNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "customer_name")}:</span> {userName}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "customer_email")}:</span>{" "}
          {userEmail}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "book_title")}:</span> {bookTitle}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "copies")}:</span> {copies}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "cost_per_copy")}:</span>{" "}
          {costPerCopy}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "page_size")}:</span> {pageSize}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "paper_color")}:</span> {paperColor}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "lamination")}:</span> {lamination}
        </Text>
        <Text style={totalRow}>
          <span style={detailLabel}>{t(locale, "reprint_admin", "total_price")}:</span>{" "}
          <span style={totalValue}>{totalPrice}</span>
        </Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={adminPanelUrl}>{t(locale, "reprint_admin", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

ReprintAdminConfirmEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze Okafor",
  userEmail: "adaeze@example.com",
  orderNumber: "BP-2026-0015",
  bookTitle: "The Art of Lagos Living",
  copies: 50,
  costPerCopy: "₦7,800",
  pageSize: "A5",
  paperColor: "Cream",
  lamination: "Matt",
  totalPrice: "₦390,000",
  adminPanelUrl: "https://bookprinta.com/admin/orders",
};

export default ReprintAdminConfirmEmail;

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

const totalRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#2A2A2A",
  margin: "12px 0 0",
  paddingTop: "12px",
  borderTop: "1px solid #ededed",
};

const totalValue: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#000000",
  fontFamily: BRAND.fontDisplay,
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};
