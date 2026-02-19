import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ReviewRequestEmailProps {
  locale?: Locale;
  userName: string;
  bookTitle: string;
  dashboardUrl: string;
}

export function ReviewRequestEmail({
  locale = "en",
  userName,
  bookTitle,
  dashboardUrl,
}: ReviewRequestEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "review_request", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "review_request", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "review_request", "body", { bookTitle })}</Text>

      <Section style={ctaSection}>
        <EmailButton href={dashboardUrl}>{t(locale, "review_request", "cta")}</EmailButton>
      </Section>

      <Text style={mutedText}>{t(locale, "review_request", "why")}</Text>
    </EmailLayout>
  );
}

ReviewRequestEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  bookTitle: "The Art of Lagos Living",
  dashboardUrl: "https://bookprinta.com/dashboard/reviews",
};

export default ReviewRequestEmail;

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

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const mutedText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0",
};
