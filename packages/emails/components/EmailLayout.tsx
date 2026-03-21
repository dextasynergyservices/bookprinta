import {
  Body,
  Button,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { Locale } from "../translations/index.ts";
import { t } from "../translations/index.ts";

const BRAND = {
  black: "#000000",
  white: "#FFFFFF",
  darkGray: "#2A2A2A",
  accent: "#007eff",
  muted: "#ededed",
  mutedText: "#6b7280",
  /** Space Grotesk Variable — Headlines, nav, CTAs */
  fontDisplay: "'Space Grotesk', Arial, sans-serif",
  /** Miller Text — Body copy, long-form text (Georgia as fallback) */
  fontSerif: "'Miller Text', Georgia, 'Times New Roman', serif",
  /** DM Sans — UI elements, buttons, labels, form inputs */
  fontSans: "'DM Sans', Helvetica, Arial, sans-serif",
} as const;

interface EmailLayoutProps {
  locale: Locale;
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ locale, preview, children }: EmailLayoutProps) {
  const year = new Date().getFullYear();

  return (
    <Html lang={locale} dir="ltr">
      <Head>
        <Font
          fontFamily="DM Sans"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhS23bUA.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="DM Sans"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAkJxhS23bUA.woff2",
            format: "woff2",
          }}
          fontWeight={600}
          fontStyle="normal"
        />
        <Font
          fontFamily="Space Grotesk"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj62UUsjNsFjTDJK.woff2",
            format: "woff2",
          }}
          fontWeight={700}
          fontStyle="normal"
        />
        <Font
          fontFamily="Miller Text"
          fallbackFontFamily="Georgia"
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Img src={EMAIL_LOGO_SRC} alt="BookPrinta" width="194" height="40" style={logoImage} />
          </Section>

          {/* Main Content */}
          <Section style={main}>{children}</Section>

          {/* Footer */}
          <Section style={footer}>
            <Hr style={divider} />
            <Text style={footerText}>
              {t(locale, "common", "regards")}
              <br />
              {t(locale, "common", "team")}
            </Text>
            <Text style={footerText}>
              {t(locale, "common", "need_help")}{" "}
              <Link href={`mailto:${t(locale, "common", "support_email")}`} style={footerLink}>
                {t(locale, "common", "support_email")}
              </Link>
            </Text>
            <Section style={footerActionSection}>
              <Button href={WHATSAPP_URL} style={footerButton}>
                {t(locale, "common", "whatsapp_cta")}
              </Button>
            </Section>
            <Text style={footerMuted}>{t(locale, "common", "footer_address")}</Text>
            <Text style={footerMuted}>{t(locale, "common", "footer_copyright", { year })}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f6f6f6",
  fontFamily: BRAND.fontSerif,
  margin: "0",
  padding: "0",
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  padding: "20px 16px",
};

const header: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "24px 0 16px",
};

const logoImage: React.CSSProperties = {
  display: "block",
  margin: "0 auto",
  height: "auto",
  maxWidth: "194px",
  /* Alt-text styling — applied by email clients when the image doesn't load */
  fontFamily: BRAND.fontDisplay,
  fontSize: "28px",
  fontWeight: 700,
  color: BRAND.black,
};

const main: React.CSSProperties = {
  backgroundColor: BRAND.white,
  borderRadius: "12px",
  padding: "32px 24px",
  border: `1px solid ${BRAND.muted}`,
};

const footer: React.CSSProperties = {
  padding: "24px 0",
  textAlign: "center" as const,
};

const divider: React.CSSProperties = {
  borderTop: `1px solid ${BRAND.muted}`,
  margin: "0 0 24px",
};

const footerText: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "13px",
  lineHeight: "20px",
  color: BRAND.darkGray,
  margin: "0 0 8px",
};

const footerLink: React.CSSProperties = {
  color: BRAND.accent,
  textDecoration: "underline",
};

const footerActionSection: React.CSSProperties = {
  margin: "16px 0 18px",
};

const footerButton: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: BRAND.black,
  color: BRAND.white,
  fontFamily: BRAND.fontSans,
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
  borderRadius: "8px",
  lineHeight: "100%",
};

const footerMuted: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "12px",
  lineHeight: "18px",
  color: BRAND.mutedText,
  margin: "0 0 4px",
};

const WHATSAPP_URL = "https://wa.me/2348103208297";

/**
 * Email logo URL — served from the frontend's public directory.
 * Uses FRONTEND_URL env var in production, falls back to the production domain.
 */
const EMAIL_LOGO_SRC = `${process.env.FRONTEND_URL || "https://bookprinta.com"}/logo-main-black.png`;

export { BRAND };
