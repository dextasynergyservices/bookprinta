import { Img, Link, Section, Text } from "@react-email/components";
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
  adminPanelUrl: string;
}

export function QuoteAdminNotificationEmail({
  locale = "en",
  referenceNumber,
  fullName,
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
  adminPanelUrl,
}: QuoteAdminNotificationEmailProps) {
  const hasBookInfo = bookTitle || genre || estimatedPages;
  const hasSpecs =
    bookSize || quantity || coverType || (specialRequirements && specialRequirements.length > 0);
  const hasTimeline = neededBy || event || budgetRange;
  const hasAttachments = imageUrl || manuscriptUrl;

  return (
    <EmailLayout locale={locale} preview={t(locale, "quote_admin", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting_admin")}</Text>
      <EmailHeading>{t(locale, "quote_admin", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "quote_admin", "body")}</Text>

      <Section style={refBox}>
        <Text style={refLabel}>{t(locale, "quote_admin", "reference")}</Text>
        <Text style={refValue}>{referenceNumber}</Text>
      </Section>

      {/* Contact Information */}
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
        {phone && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "quote_admin", "phone")}:</span> {phone}
          </Text>
        )}
        {organization && (
          <Text style={detailRow}>
            <span style={detailLabel}>{t(locale, "quote_admin", "organization")}:</span>{" "}
            {organization}
          </Text>
        )}
      </Section>

      {/* Book Information */}
      {hasBookInfo && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_admin", "book_info")}</Text>
          {bookTitle && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "book_title")}:</span> {bookTitle}
            </Text>
          )}
          {genre && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "genre")}:</span> {genre}
            </Text>
          )}
          {estimatedPages && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "estimated_pages")}:</span>{" "}
              {estimatedPages}
            </Text>
          )}
        </Section>
      )}

      {/* Specifications */}
      {hasSpecs && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_admin", "specifications")}</Text>
          {bookSize && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "book_size")}:</span> {bookSize}
            </Text>
          )}
          {quantity && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "quantity")}:</span> {quantity}
            </Text>
          )}
          {coverType && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "cover_type")}:</span> {coverType}
            </Text>
          )}
          {specialRequirements && specialRequirements.length > 0 && (
            <>
              <Text style={detailLabel}>{t(locale, "quote_admin", "special_requirements")}:</Text>
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
      {hasTimeline && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_admin", "timeline_info")}</Text>
          {neededBy && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "needed_by")}:</span> {neededBy}
            </Text>
          )}
          {event && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "event")}:</span> {event}
            </Text>
          )}
          {budgetRange && (
            <Text style={detailRow}>
              <span style={detailLabel}>{t(locale, "quote_admin", "budget_range")}:</span>{" "}
              {budgetRange}
            </Text>
          )}
        </Section>
      )}

      {/* Additional Details */}
      {additionalDetails && (
        <Section style={detailsBox}>
          <Text style={sectionTitle}>{t(locale, "quote_admin", "additional_details")}</Text>
          <Text style={detailRow}>{additionalDetails}</Text>
        </Section>
      )}

      {/* Attachments */}
      <Section style={detailsBox}>
        <Text style={sectionTitle}>{t(locale, "quote_admin", "attachments")}</Text>
        {hasAttachments ? (
          <>
            {imageUrl && (
              <>
                <Img src={imageUrl} alt="Uploaded image" width="100%" style={attachmentImage} />
                <Link href={imageUrl} style={attachmentLink}>
                  {t(locale, "quote_admin", "view_image")}
                </Link>
              </>
            )}
            {manuscriptUrl && (
              <Text style={detailRow}>
                <Link href={manuscriptUrl} style={attachmentLink}>
                  {t(locale, "quote_admin", "view_manuscript")}
                </Link>
              </Text>
            )}
          </>
        ) : (
          <Text style={mutedText}>{t(locale, "quote_admin", "no_attachments")}</Text>
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
  referenceNumber: "CQ-2026-0042",
  fullName: "Adaeze Okafor",
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
    "This is a coffee-table style book with over 100 photographs. We need premium paper stock and a custom dust jacket.",
  imageUrl: "https://placehold.co/600x400/ededed/2A2A2A?text=Book+Cover+Reference",
  manuscriptUrl: "https://example.com/manuscript.docx",
  adminPanelUrl: "https://bookprinta.com/admin/quotes/CQ-2026-0042",
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
  textAlign: "center" as const,
  border: "1px solid #f59e0b",
};

const refLabel: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "12px",
  fontWeight: 600,
  color: "#92400e",
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

const linkStyle: React.CSSProperties = {
  color: BRAND.accent,
  textDecoration: "underline",
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: BRAND.mutedText,
  margin: "0",
  fontStyle: "italic",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};
