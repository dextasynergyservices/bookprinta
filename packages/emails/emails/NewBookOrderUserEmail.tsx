import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface NewBookOrderUserEmailProps {
  locale?: Locale;
  userName: string;
  orderNumber: string;
  packageName: string;
  totalPrice: string;
  addons?: string[];
  dashboardUrl: string;
}

export function NewBookOrderUserEmail({
  locale = "en",
  userName,
  orderNumber,
  packageName,
  totalPrice,
  addons = [],
  dashboardUrl,
}: NewBookOrderUserEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "new_book_order_confirm", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "new_book_order_confirm", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "new_book_order_confirm", "body")}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_confirm", "order_number")}:</span>{" "}
          {orderNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_confirm", "package")}:</span>{" "}
          {packageName}
        </Text>
        {addons.length > 0 && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "new_book_order_confirm", "addons")}:</span>{" "}
            {addons.join(", ")}
          </Text>
        )}
        <Text style={totalRow}>
          <span style={detailLabel}>{t(locale, "new_book_order_confirm", "total_price")}:</span>{" "}
          <span style={totalValue}>{totalPrice}</span>
        </Text>
      </Section>

      <Text style={bodyText}>{t(locale, "new_book_order_confirm", "next_steps")}</Text>

      <Section style={ctaSection}>
        <EmailButton href={dashboardUrl}>{t(locale, "new_book_order_confirm", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

NewBookOrderUserEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  orderNumber: "BP-2026-0042",
  packageName: "Author Launch 1",
  totalPrice: "₦185,000",
  addons: ["ISBN Registration", "Formatting (50,000 words)"],
  dashboardUrl: "https://bookprinta.com/dashboard",
};

export default NewBookOrderUserEmail;

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
