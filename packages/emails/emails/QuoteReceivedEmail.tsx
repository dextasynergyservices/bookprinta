import { Img, Link, Section, Text } from "@react-email/components";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { BRAND, EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface QuoteReceivedEmailProps {
  locale?: Locale;
  userName: string;
  referenceNumber: string;
  email?: string;
  phone?: string;
  organization?: string;
  bookTitle?: string;
  genre?: string;
  estimatedPages?: string;
  bookSize?: string;
  quantity?: string;
  coverType?: string;
  specialRequirements?: string[];
  neededBy?: string;
  event?: string;
  budgetRange?: string;
  additionalDetails?: string;
  imageUrl?: string;
  manuscriptUrl?: string;
}

export function QuoteReceivedEmail({
  locale = "en",
  userName,
  referenceNumber,
  email,
  phone,
  organization,
  bookTitle,
  genre,
  estimatedPages,
  bookSize,
  quantity,
  coverType,
  specialRequirements,
  neededBy,
  event,
  budgetRange,
  additionalDetails,
  imageUrl,
  manuscriptUrl,
}: QuoteReceivedEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "quote_received", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "quote_received", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "quote_received", "body")}</Text>

      <Section style={refBox}>
        <Text style={refLabel}>{t(locale, "quote_received", "reference")}</Text>
        <Text style={refValue}>{referenceNumber}</Text>
      </Section>

      {/* Your Details */}
      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_received", "your_details")}</Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{t(locale, "quote_received", "full_name")}:</span> {userName}
        </Text>
        {email && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "quote_received", "email")}:</span> {email}
          </Text>
        )}
        {phone && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "quote_received", "phone")}:</span> {phone}
          </Text>
        )}
        {organization && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "quote_received", "organization")}:</span>{" "}
            {organization}
          </Text>
        )}
      </Section>

      {/* Book Details */}
      {(bookTitle || genre || estimatedPages) && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_received", "book_details")}</Text>
          {bookTitle && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "book_title")}:</span>{" "}
              {bookTitle}
            </Text>
          )}
          {genre && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "genre")}:</span> {genre}
            </Text>
          )}
          {estimatedPages && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "estimated_pages")}:</span>{" "}
              {estimatedPages}
            </Text>
          )}
        </Section>
      )}

      {/* Specifications */}
      {(bookSize ||
        quantity ||
        coverType ||
        (specialRequirements && specialRequirements.length > 0)) && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_received", "specifications")}</Text>
          {bookSize && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "book_size")}:</span>{" "}
              {bookSize}
            </Text>
          )}
          {quantity && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "quantity")}:</span> {quantity}
            </Text>
          )}
          {coverType && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "cover_type")}:</span>{" "}
              {coverType}
            </Text>
          )}
          {specialRequirements && specialRequirements.length > 0 && (
            <>
              <Text style={detailLabel}>
                {t(locale, "quote_received", "special_requirements")}:
              </Text>
              {specialRequirements.map((req) => (
                <Text key={req} style={listItem}>
                  {req}
                </Text>
              ))}
            </>
          )}
        </Section>
      )}

      {/* Timeline & Budget */}
      {(neededBy || event || budgetRange) && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_received", "timeline")}</Text>
          {neededBy && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "needed_by")}:</span>{" "}
              {neededBy}
            </Text>
          )}
          {event && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "event")}:</span> {event}
            </Text>
          )}
          {budgetRange && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_received", "budget_range")}:</span>{" "}
              {budgetRange}
            </Text>
          )}
        </Section>
      )}

      {/* Additional Details */}
      {additionalDetails && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_received", "additional_details")}</Text>
          <Text style={detailRow}>{additionalDetails}</Text>
        </Section>
      )}

      {/* Attachments */}
      {(imageUrl || manuscriptUrl) && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_received", "attachments")}</Text>
          {imageUrl && (
            <>
              <Img src={imageUrl} alt="Uploaded image" width="100%" style={attachmentImage} />
              <Link href={imageUrl} style={attachmentLink}>
                {t(locale, "quote_received", "view_image")}
              </Link>
            </>
          )}
          {manuscriptUrl && (
            <Text style={detailRow}>
              <Link href={manuscriptUrl} style={attachmentLink}>
                {t(locale, "quote_received", "view_manuscript")}
              </Link>
            </Text>
          )}
        </Section>
      )}

      {/* What's Next */}
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
  userName: "Adaeze Okafor",
  referenceNumber: "CQ-2026-0042",
  email: "adaeze@example.com",
  phone: "+234 801 234 5678",
  organization: "Nkem Publishers",
  bookTitle: "The Art of Lagos Living",
  genre: "Non-Fiction / Lifestyle",
  estimatedPages: "280",
  bookSize: "Custom size (6x9 inches)",
  quantity: "200+ copies",
  coverType: "Hardback",
  specialRequirements: [
    "Full-color interior (not just cover)",
    "Premium finishes (foil, embossing, etc.)",
    "Photography-heavy layout",
  ],
  neededBy: "March 15, 2026",
  event: "Lagos Book Festival 2026",
  budgetRange: "N500k-N1M",
  additionalDetails:
    "This is a coffee-table style book with over 100 photographs. We need premium paper stock and a custom dust jacket. The book will be distributed at the Lagos Book Festival.",
  imageUrl: "https://placehold.co/600x400/ededed/2A2A2A?text=Book+Cover+Reference",
  manuscriptUrl: "https://example.com/manuscript.docx",
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
  textAlign: "center" as const,
  border: `1px solid ${BRAND.muted}`,
};

const refLabel: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "12px",
  fontWeight: 600,
  color: BRAND.mutedText,
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
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

const sectionTitle: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "13px",
  fontWeight: 600,
  color: BRAND.black,
  margin: "0 0 12px",
  textTransform: "uppercase" as const,
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
  margin: "0 0 2px",
  paddingLeft: "12px",
};

const attachmentImage: React.CSSProperties = {
  borderRadius: "6px",
  marginBottom: "8px",
  maxHeight: "200px",
  objectFit: "cover" as const,
};

const attachmentLink: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "13px",
  color: BRAND.accent,
  textDecoration: "underline",
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
