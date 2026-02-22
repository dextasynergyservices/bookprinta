import { ArrowLeft, BookOpen, Mail } from "lucide-react";

/**
 * Root-level 404 page — shown when the URL doesn't match any locale prefix.
 * This page is outside the [locale] layout, so it cannot use next-intl.
 * All strings are hardcoded in English as a safe fallback.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem 1rem",
            backgroundColor: "#ffffff",
            color: "#09090b",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle radial glow */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 500,
              height: 500,
              borderRadius: "50%",
              background: "rgba(0, 126, 255, 0.04)",
              filter: "blur(80px)",
            }}
          />

          <div
            style={{
              position: "relative",
              zIndex: 1,
              maxWidth: 520,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* 404 */}
            <h1
              style={{
                fontSize: "clamp(8rem, 20vw, 12rem)",
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.05em",
                color: "rgba(9, 9, 11, 0.08)",
                margin: 0,
                userSelect: "none",
              }}
            >
              404
            </h1>

            {/* Subheading */}
            <h2
              style={{
                fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginTop: "-0.5rem",
                color: "#09090b",
              }}
            >
              Lost in the pages.
            </h2>

            {/* Divider */}
            <div
              style={{
                marginTop: "1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
              aria-hidden="true"
            >
              <span
                style={{
                  display: "block",
                  width: 48,
                  height: 1,
                  backgroundColor: "#e4e4e7",
                }}
              />
              <BookOpen size={16} color="#a1a1aa" />
              <span
                style={{
                  display: "block",
                  width: 48,
                  height: 1,
                  backgroundColor: "#e4e4e7",
                }}
              />
            </div>

            {/* Description */}
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "1.05rem",
                lineHeight: 1.7,
                color: "#71717a",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get
              you back to a chapter that does.
            </p>

            {/* CTA buttons */}
            <div
              style={{
                marginTop: "2.5rem",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "0.75rem",
              }}
            >
              <a
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 2rem",
                  borderRadius: 9999,
                  backgroundColor: "#007eff",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "opacity 0.2s",
                }}
              >
                <ArrowLeft size={16} />
                Back to Home
              </a>
              <a
                href="/showcase"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 2rem",
                  borderRadius: 9999,
                  border: "1px solid #e4e4e7",
                  backgroundColor: "transparent",
                  color: "#09090b",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "background-color 0.2s",
                }}
              >
                <BookOpen size={16} />
                Browse Showcase
              </a>
              <a
                href="/contact"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 2rem",
                  borderRadius: 9999,
                  backgroundColor: "transparent",
                  color: "#71717a",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
              >
                <Mail size={16} />
                Contact Us
              </a>
            </div>
          </div>

          {/* Bottom decorative line */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 1,
              background: "linear-gradient(to right, transparent, #e4e4e7, transparent)",
            }}
          />
        </div>
      </body>
    </html>
  );
}
