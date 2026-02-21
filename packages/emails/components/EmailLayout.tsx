import {
  Body,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { Locale } from "../translations/index";
import { t } from "../translations/index";

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
  /** Poppins — UI elements, buttons, labels, form inputs */
  fontSans: "'Poppins', Helvetica, Arial, sans-serif",
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
          fontFamily="Poppins"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecg.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Poppins"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2",
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
            <Text style={logoText}>BookPrinta</Text>
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

const logoText: React.CSSProperties = {
  fontFamily: BRAND.fontDisplay,
  fontSize: "28px",
  fontWeight: 700,
  color: BRAND.black,
  margin: "0",
  letterSpacing: "-0.5px",
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

const footerMuted: React.CSSProperties = {
  fontFamily: BRAND.fontSans,
  fontSize: "12px",
  lineHeight: "18px",
  color: BRAND.mutedText,
  margin: "0 0 4px",
};

export { BRAND };
