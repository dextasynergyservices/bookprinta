import { Section, Text } from "@react-email/components";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface QuoteReceivedEmailProps {
  locale?: Locale;
  referenceNumber: string;
  userName: string;
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

  const translated = t(locale, "quote_received", key);
  return translated === key ? humanizeRequirement(value) : translated;
}

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function QuoteReceivedEmail({
  locale = "en",
  referenceNumber,
  userName,
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
}: QuoteReceivedEmailProps) {
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
    <EmailLayout locale={locale} preview={t(locale, "quote_received", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "quote_received", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "quote_received", "body")}</Text>

      <Section style={refBox}>
        <Text style={refLabel}>{t(locale, "quote_received", "reference")}</Text>
        <Text style={refValue}>{referenceNumber}</Text>
      </Section>

      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_received", "contact_info")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "full_name")}:</span> {userName}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "email")}:</span> {email}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "phone")}:</span> {phone}
        </Text>
      </Section>

      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_received", "summary")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "working_title")}:</span>{" "}
          {workingTitle}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "estimated_word_count")}:</span>{" "}
          {estimatedWordCount.toLocaleString("en-NG")}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "book_size")}:</span> {bookSize}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "quantity")}:</span>{" "}
          {quantity.toLocaleString("en-NG")}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "cover_type")}:</span>{" "}
          {coverType === "paperback"
            ? t(locale, "quote_received", "cover_type_paperback")
            : coverType}
        </Text>
      </Section>

      {hasSpecialReqs && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_received", "special_requirements")}</Text>
          {selectedSpecialRequirements.length > 0 ? (
            selectedSpecialRequirements.map((requirement) => (
              <Text key={requirement} style={listItem}>
                {requirement}
              </Text>
            ))
          ) : (
            <Text style={detailRow}>
              {t(locale, "quote_received", "special_requirements_none")}
            </Text>
          )}
          {normalizedOther && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "other_details")}:</span>{" "}
              {normalizedOther}
            </Text>
          )}
        </Section>
      )}

      <Section style={pricingBox}>
        <Text style={sectionTitle}>{t(locale, "quote_received", "pricing")}</Text>
        {estimateRange ? (
          <>
            <Text style={estimateValue}>{estimateRange}</Text>
            <Text style={mutedText}>{t(locale, "quote_received", "pricing_note")}</Text>
          </>
        ) : (
          <Text style={mutedText}>{t(locale, "quote_received", "custom_pricing_note")}</Text>
        )}
      </Section>

      <Text style={subheading}>{t(locale, "quote_received", "what_next")}</Text>
      <Section style={stepsList}>
        <Text style={stepItem}>1. {t(locale, "quote_received", "step_1")}</Text>
        <Text style={stepItem}>2. {t(locale, "quote_received", "step_2")}</Text>
        <Text style={stepItem}>3. {t(locale, "quote_received", "step_3")}</Text>
      </Section>
    </EmailLayout>
  );
}

QuoteReceivedEmail.PreviewProps = {
  locale: "en" as Locale,
  referenceNumber: "cmc7f4w3w0001zt8f2j9q4a5x",
  userName: "Adaeze",
  email: "adaeze@example.com",
  phone: "+2348012345678",
  workingTitle: "The Art of Lagos Living",
  estimatedWordCount: 48000,
  bookSize: "A5",
  quantity: 200,
  coverType: "paperback",
  hasSpecialReqs: true,
  specialRequirements: ["hardback", "gold_foil", "other"],
  specialRequirementsOther: "Need premium matte paper stock for all copies.",
  estimatedPriceLow: null,
  estimatedPriceHigh: null,
};

export default QuoteReceivedEmail;

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
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  textAlign: "center",
  border: `1px solid ${BRAND.muted}`,
};

const refLabel: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "12px",
  fontWeight: 600,
  color: BRAND.mutedText,
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
  backgroundColor: "#eef6ff",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 16px",
  border: `1px solid ${BRAND.accent}`,
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
  margin: "0 0 4px",
  fontFamily: BRAND.fontDisplay,
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: BRAND.mutedText,
  margin: "0",
};

const subheading: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: BRAND.black,
  margin: "8px 0 12px",
};

const stepsList: React.CSSProperties = {
  padding: "0",
};

const stepItem: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: BRAND.darkGray,
  margin: "0 0 8px",
  paddingLeft: "4px",
};
