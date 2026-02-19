import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ProductionDelayEmailProps {
  locale?: Locale;
  userName: string;
  affectedBooks: string[];
  dashboardUrl: string;
}

export function ProductionDelayEmail({
  locale = "en",
  userName,
  affectedBooks,
  dashboardUrl,
}: ProductionDelayEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "production_delay", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "production_delay", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "production_delay", "body")}</Text>

      {affectedBooks.length > 0 && (
        <Section style={booksBox}>
          <Text style={booksLabel}>{t(locale, "production_delay", "affected_books")}</Text>
          {affectedBooks.map((title) => (
            <Text key={title} style={bookItem}>
              {title}
            </Text>
          ))}
        </Section>
      )}

      <Text style={patienceText}>{t(locale, "production_delay", "patience")}</Text>

      <Section style={ctaSection}>
        <EmailButton href={dashboardUrl}>{t(locale, "production_delay", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

ProductionDelayEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  affectedBooks: ["The Art of Lagos Living", "My Journey Home"],
  dashboardUrl: "https://bookprinta.com/dashboard",
};

export default ProductionDelayEmail;

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

const booksBox: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  borderLeft: "4px solid #f59e0b",
};

const booksLabel: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#92400e",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const bookItem: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2A2A2A",
  margin: "0 0 4px",
  paddingLeft: "12px",
  borderLeft: "2px solid #f59e0b",
};

const patienceText: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2A2A2A",
  margin: "0 0 24px",
  fontStyle: "italic",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};
