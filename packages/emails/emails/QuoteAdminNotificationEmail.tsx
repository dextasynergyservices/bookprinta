import { Link, Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface QuoteAdminNotificationEmailProps {
  locale?: Locale;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string;
  workingTitle: string;
  estimatedWordCount: number;
  bookSize: string;
  quantity: number;
  coverType?: string;
  hasSpecialReqs: boolean;
  specialRequirements?: string[];
  specialRequirementsOther?: string | null;
  estimatedPriceLow?: number | null;
  estimatedPriceHigh?: number | null;
  adminPanelUrl: string;
}

const SPECIAL_REQUIREMENT_KEYS: Record<string, string> = {
  hardback: "special_req_hardback",
  embossing: "special_req_embossing",
  gold_foil: "special_req_gold_foil",
  special_size: "special_req_special_size",
  full_color_interior: "special_req_full_color_interior",
  special_paper: "special_req_special_paper",
  other: "special_req_other",
};

function humanizeRequirement(value: string): string {
  return value
    .trim()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSpecialRequirementLabel(locale: Locale, value: string): string {
  const key = SPECIAL_REQUIREMENT_KEYS[value];
  if (!key) return humanizeRequirement(value);

  const translated = t(locale, "quote_admin", key);
  return translated === key ? humanizeRequirement(value) : translated;
}

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function QuoteAdminNotificationEmail({
  locale = "en",
  referenceNumber,
  fullName,
  email,
  phone,
  workingTitle,
  estimatedWordCount,
  bookSize,
  quantity,
  coverType = "paperback",
  hasSpecialReqs,
  specialRequirements = [],
  specialRequirementsOther,
  estimatedPriceLow,
  estimatedPriceHigh,
  adminPanelUrl,
}: QuoteAdminNotificationEmailProps) {
  const estimateVisible =
    !hasSpecialReqs && estimatedPriceLow != null && estimatedPriceHigh != null;
  const estimateRange = estimateVisible
    ? `${formatNaira(estimatedPriceLow)} - ${formatNaira(estimatedPriceHigh)}`
    : null;
  const selectedSpecialRequirements = hasSpecialReqs
    ? specialRequirements.map((item) => getSpecialRequirementLabel(locale, item))
    : [];
  const normalizedOther = specialRequirementsOther?.trim();

  return (
    <EmailLayout locale={locale} preview={t(locale, "quote_admin", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting_admin")}</Text>
      <EmailHeading>{t(locale, "quote_admin", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "quote_admin", "body")}</Text>

      <Section style={refBox}>
        <Text style={refLabel}>{t(locale, "quote_admin", "reference")}</Text>
        <Text style={refValue}>{referenceNumber}</Text>
      </Section>

      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_admin", "contact_info")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "full_name")}:</span> {fullName}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "email")}:</span>{" "}
          <Link href={`mailto:${email}`} style={linkStyle}>
            {email}
          </Link>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "phone")}:</span> {phone}
        </Text>
      </Section>

      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_admin", "manuscript_info")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "working_title")}:</span>{" "}
          {workingTitle}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "estimated_word_count")}:</span>{" "}
          {estimatedWordCount.toLocaleString("en-NG")}
        </Text>
      </Section>

      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_admin", "print_info")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "book_size")}:</span> {bookSize}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "quantity")}:</span>{" "}
          {quantity.toLocaleString("en-NG")}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_admin", "cover_type")}:</span>{" "}
          {coverType === "paperback" ? t(locale, "quote_admin", "cover_type_paperback") : coverType}
        </Text>
      </Section>

      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_admin", "special_requirements")}</Text>
        {hasSpecialReqs && selectedSpecialRequirements.length > 0 ? (
          selectedSpecialRequirements.map((requirement) => (
            <Text key={requirement} style={listItem}>
              {requirement}
            </Text>
          ))
        ) : (
          <Text style={detailRow}>{t(locale, "quote_admin", "special_requirements_none")}</Text>
        )}
        {normalizedOther && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "quote_admin", "other_details")}:</span>{" "}
            {normalizedOther}
          </Text>
        )}
      </Section>

      <Section style={pricingBox}>
        <Text style={sectionTitle}>{t(locale, "quote_admin", "pricing")}</Text>
        {estimateRange ? (
          <Text style={estimateValue}>{estimateRange}</Text>
        ) : (
          <Text style={warningText}>{t(locale, "quote_admin", "custom_pricing_note")}</Text>
        )}
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={adminPanelUrl}>{t(locale, "quote_admin", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

QuoteAdminNotificationEmail.PreviewProps = {
  locale: "en" as Locale,
  referenceNumber: "cmc7f4w3w0001zt8f2j9q4a5x",
  fullName: "Adaeze Okafor",
  email: "adaeze@example.com",
  phone: "+2348012345678",
  workingTitle: "The Art of Lagos Living",
  estimatedWordCount: 48000,
  bookSize: "A5",
  quantity: 200,
  coverType: "paperback",
  hasSpecialReqs: false,
  specialRequirements: [],
  specialRequirementsOther: null,
  estimatedPriceLow: 340000,
  estimatedPriceHigh: 350000,
  adminPanelUrl: "https://bookprinta.com/admin/quotes/cmc7f4w3w0001zt8f2j9q4a5x",
};

export default QuoteAdminNotificationEmail;

const greeting: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: BRAND.darkGray,
  margin: "0 0 8px",
};

const bodyText: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: BRAND.darkGray,
  margin: "0 0 24px",
};

const refBox: React.CSSProperties = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  textAlign: "center",
  border: "1px solid #f59e0b",
};

const refLabel: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "12px",
  fontWeight: 600,
  color: "#92400e",
  margin: "0 0 4px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const refValue: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: BRAND.black,
  margin: "0",
  fontFamily: BRAND.fontDisplay,
};

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 16px",
  border: `1px solid ${BRAND.muted}`,
};

const pricingBox: React.CSSProperties = {
  backgroundColor: "#fff7ed",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 16px",
  border: "1px solid #fdba74",
};

const sectionTitle: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "13px",
  fontWeight: 600,
  color: BRAND.black,
  margin: "0 0 12px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const detailRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: BRAND.darkGray,
  margin: "0 0 4px",
};

const detailLabel: React.CSSProperties = {
  fontWeight: 600,
};

const listItem: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: BRAND.darkGray,
  margin: "0 0 4px",
  paddingLeft: "12px",
};

const estimateValue: React.CSSProperties = {
  fontSize: "20px",
  lineHeight: "28px",
  fontWeight: 700,
  color: BRAND.accent,
  margin: "0",
  fontFamily: BRAND.fontDisplay,
};

const warningText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#b45309",
  margin: "0",
  fontWeight: 600,
};

const linkStyle: React.CSSProperties = {
  color: BRAND.accent,
  textDecoration: "underline",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center",
  margin: "24px 0",
};
