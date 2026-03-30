import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface NewBookOrderAdminEmailProps {
  locale?: Locale;
  userName: string;
  userEmail: string;
  orderNumber: string;
  packageName: string;
  totalPrice: string;
  addons?: string[];
  provider: string;
  reference: string;
  adminPanelUrl: string;
}

export function NewBookOrderAdminEmail({
  locale = "en",
  userName,
  userEmail,
  orderNumber,
  packageName,
  totalPrice,
  addons = [],
  provider,
  reference,
  adminPanelUrl,
}: NewBookOrderAdminEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "new_book_order_admin", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting_admin")}</Text>
      <EmailHeading>{t(locale, "new_book_order_admin", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "new_book_order_admin", "body")}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_admin", "order_number")}:</span>{" "}
          {orderNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_admin", "customer_name")}:</span>{" "}
          {userName}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_admin", "customer_email")}:</span>{" "}
          {userEmail}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_admin", "package")}:</span>{" "}
          {packageName}
        </Text>
        {addons.length > 0 && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "new_book_order_admin", "addons")}:</span>{" "}
            {addons.join(", ")}
          </Text>
        )}
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_admin", "provider")}:</span>{" "}
          {provider}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_admin", "reference")}:</span>{" "}
          {reference}
        </Text>
        <Text style={totalRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_admin", "total_price")}:</span>{" "}
          <span style={totalValue}>{totalPrice}</span>
        </Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={adminPanelUrl}>{t(locale, "new_book_order_admin", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

NewBookOrderAdminEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze Okafor",
  userEmail: "adaeze@example.com",
  orderNumber: "BP-2026-0042",
  packageName: "Author Launch 1",
  totalPrice: "₦185,000",
  addons: ["ISBN Registration", "Formatting (50,000 words)"],
  provider: "PAYSTACK",
  reference: "PSK-1719504000-abc123",
  adminPanelUrl: "https://bookprinta.com/admin/orders",
};

export default NewBookOrderAdminEmail;

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
