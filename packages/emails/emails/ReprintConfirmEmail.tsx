import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ReprintConfirmEmailProps {
  locale?: Locale;
  userName: string;
  orderNumber: string;
  bookTitle: string;
  copies: number;
  pageSize: string;
  paperColor: string;
  lamination: string;
  totalPrice: string;
  dashboardUrl: string;
}

export function ReprintConfirmEmail({
  locale = "en",
  userName,
  orderNumber,
  bookTitle,
  copies,
  pageSize,
  paperColor,
  lamination,
  totalPrice,
  dashboardUrl,
}: ReprintConfirmEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "reprint_confirm", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "reprint_confirm", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "reprint_confirm", "body")}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_confirm", "order_number")}:</span>{" "}
          {orderNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_confirm", "book_title")}:</span> {bookTitle}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_confirm", "copies")}:</span> {copies}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_confirm", "page_size")}:</span> {pageSize}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_confirm", "paper_color")}:</span>{" "}
          {paperColor}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "reprint_confirm", "lamination")}:</span>{" "}
          {lamination}
        </Text>
        <Text style={totalRow}>
          <span style={detailLabel}>{t(locale, "reprint_confirm", "total_price")}:</span>{" "}
          <span style={totalValue}>{totalPrice}</span>
        </Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={dashboardUrl}>{t(locale, "reprint_confirm", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

ReprintConfirmEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  orderNumber: "BP-2026-0015",
  bookTitle: "The Art of Lagos Living",
  copies: 50,
  pageSize: "A5",
  paperColor: "Cream",
  lamination: "Matt",
  totalPrice: "N375,000",
  dashboardUrl: "https://bookprinta.com/dashboard",
};

export default ReprintConfirmEmail;

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
