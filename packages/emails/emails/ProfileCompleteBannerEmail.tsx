import { Section, Text } from "@react-email/components";
import { EmailButton } from "../components/EmailButton.tsx";
import { EmailHeading } from "../components/EmailHeading.tsx";
import { EmailLayout } from "../components/EmailLayout.tsx";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

interface ProfileCompleteBannerEmailProps {
  locale?: Locale;
  userName: string;
  profileUrl: string;
}

export function ProfileCompleteBannerEmail({
  locale = "en",
  userName,
  profileUrl,
}: ProfileCompleteBannerEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t(locale, "profile_complete", "heading")}>
      <Text style={greeting}>{t(locale, "common", "greeting", { name: userName })}</Text>
      <EmailHeading>{t(locale, "profile_complete", "heading")}</EmailHeading>
      <Text style={bodyText}>{t(locale, "profile_complete", "body")}</Text>

      <Section style={benefitsBox}>
        <Text style={benefitsTitle}>{t(locale, "profile_complete", "benefits")}</Text>
        <Text style={benefitItem}>{t(locale, "profile_complete", "benefit_1")}</Text>
        <Text style={benefitItem}>{t(locale, "profile_complete", "benefit_2")}</Text>
        <Text style={benefitItem}>{t(locale, "profile_complete", "benefit_3")}</Text>
      </Section>

      <Section style={ctaSection}>
        <EmailButton href={profileUrl}>{t(locale, "profile_complete", "cta")}</EmailButton>
      </Section>
    </EmailLayout>
  );
}

ProfileCompleteBannerEmail.PreviewProps = {
  locale: "en" as Locale,
  userName: "Adaeze",
  profileUrl: "https://bookprinta.com/dashboard/profile",
};

export default ProfileCompleteBannerEmail;

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

const benefitsBox: React.CSSProperties = {
  backgroundColor: "#f0f9ff",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
  borderLeft: "4px solid #007eff",
};

const benefitsTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#000000",
  margin: "0 0 8px",
};

const benefitItem: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2A2A2A",
  margin: "0 0 4px",
  paddingLeft: "12px",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};
