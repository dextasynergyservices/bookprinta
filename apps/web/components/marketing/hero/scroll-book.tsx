"use client";

/* ─────────────────────────────────────────────────────────────
 * ScrollBook — CSS 3D book that opens/closes based on scroll
 * Modern, premium design — zero WebGL / Three.js
 * ───────────────────────────────────────────────────────────── */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 4;

interface ScrollBookProps {
  /** 0 = closed, 1 = fully open */
  scrollProgress: number;
  /** Book title displayed on the cover */
  title?: string;
  /** Author name displayed on the cover */
  author?: string;
  /** Cover gradient start color */
  coverColorFrom?: string;
  /** Cover gradient end color */
  coverColorTo?: string;
  /** Accent color (brand blue) */
  accentColor?: string;
  /** CSS scale multiplier (e.g. 1.8 for mobile) */
  bookScale?: number;
}

const PAGE_COUNT = 5;

export function ScrollBook({
  scrollProgress,
  title = "BOOK\nPRINTA",
  author = "DEXTA SYNERGY",
  coverColorFrom = "#1a1a2e",
  coverColorTo = "#0a0a14",
  accentColor = "#007eff",
  bookScale = 1,
}: ScrollBookProps) {
  const raw = clamp(scrollProgress, 0, 1);
  const t = easeOut(raw);

  // Front cover opens from -2deg (almost closed) to -130deg (open but contained)
  const coverAngle = lerp(-2, -130, t);

  // Pages fan open — each page starts earlier and fans faster
  const pages = Array.from({ length: PAGE_COUNT }, (_, i) => {
    const pageFactor = i / (PAGE_COUNT - 1);
    const pageT = easeOut(clamp((raw - 0.03 - pageFactor * 0.06) / 0.5, 0, 1));
    const angle = lerp(-1, lerp(-25, -100, pageFactor), pageT);
    return { angle, pageFactor };
  });

  // Whole book tilts for drama as it opens
  const bookRotateX = lerp(8, 16, t);
  const bookRotateY = lerp(-12, -18, t);
  const bookTranslateY = lerp(0, -15, t);

  // Shadow spreads as book opens
  const shadowW = lerp(160, 260, t);
  const shadowH = lerp(18, 12, t);
  const shadowOpacity = lerp(0.5, 0.3, t);
  const shadowX = lerp(0, 40, t);

  // Glow intensity based on scroll
  const glowOpacity = lerp(0.15, 0.35, t);

  // Spine/inside cover colors
  const spineGradient = `linear-gradient(to bottom, ${coverColorFrom}, ${coverColorTo})`;
  const insideGradient = `linear-gradient(135deg, #111122 0%, #0d0d1a 100%)`;

  // Simulated page content with varying line widths for realism
  const pageLines = [
    { width: "75%", isBold: true, height: 3 },
    { width: "100%", isBold: false, height: 2 },
    { width: "92%", isBold: false, height: 2 },
    { width: "88%", isBold: false, height: 2 },
    { width: "100%", isBold: false, height: 2 },
    { width: "60%", isBold: false, height: 2 },
    { width: "0%", isBold: false, height: 0 }, // paragraph break
    { width: "85%", isBold: true, height: 2.5 },
    { width: "100%", isBold: false, height: 2 },
    { width: "95%", isBold: false, height: 2 },
    { width: "78%", isBold: false, height: 2 },
    { width: "100%", isBold: false, height: 2 },
  ];

  return (
    <div
      aria-hidden="true"
      style={{
        perspective: 1200,
        perspectiveOrigin: "50% 44%",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* The whole book assembly */}
      <div
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transform: `scale(${bookScale}) rotateX(${bookRotateX}deg) rotateY(${bookRotateY}deg) translateY(${bookTranslateY}px)`,
          willChange: "transform",
        }}
      >
        {/* ── Accent glow behind the book ── */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 200,
            height: 200,
            transform: "translate(-50%, -50%) translateZ(-20px)",
            background: `radial-gradient(circle, ${accentColor}40 0%, transparent 70%)`,
            opacity: glowOpacity,
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        {/* ── Back cover (static, always visible) ── */}
        <div
          style={{
            width: "clamp(140px,18vw,190px)",
            height: "clamp(195px,25vw,268px)",
            background: `linear-gradient(160deg, ${coverColorFrom}, ${coverColorTo})`,
            borderRadius: "2px 8px 8px 2px",
            position: "relative",
            boxShadow: `inset -3px 0 10px rgba(0,0,0,0.7), inset 0 0 30px rgba(0,0,0,0.3)`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* ── Pages sitting in the gutter ── */}
          {pages.map(({ angle }, i) => (
            <div
              key={`book-page-${
                // biome-ignore lint/suspicious/noArrayIndexKey: Static array
                i
              }`}
              style={{
                position: "absolute",
                top: "1.5%",
                bottom: "1.5%",
                left: 0,
                width: "100%",
                transformOrigin: "left center",
                transform: `rotateY(${angle}deg)`,
                transformStyle: "preserve-3d",
                willChange: "transform",
                zIndex: PAGE_COUNT - i,
              }}
            >
              {/* Page face (right side — readable face) */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "0 6px 6px 0",
                  background: "linear-gradient(to right, #f8f9fa 0%, #ffffff 30%, #f8f9fa 100%)",
                  boxShadow: "inset -2px 0 8px rgba(0,0,0,.06)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  padding: "clamp(12px,1.8vw,18px) clamp(14px,2.2vw,20px)",
                  gap: 5,
                  backfaceVisibility: "hidden",
                }}
              >
                {/* Simulated text lines — clean modern look */}
                {pageLines.map((line, li) => (
                  <div
                    key={`line-${i}-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: Static array
                      li
                    }`}
                    style={{
                      height: line.height,
                      borderRadius: 1,
                      background: line.isBold ? "rgba(20,20,40,0.25)" : "rgba(20,20,40,0.10)",
                      width: line.width,
                      marginTop: line.height === 0 ? 6 : 0,
                    }}
                  />
                ))}

                {/* Page number */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 10,
                    right: 14,
                    fontFamily: "var(--font-sans)",
                    fontSize: 7,
                    color: "rgba(20,20,40,.2)",
                    letterSpacing: "0.5px",
                  }}
                >
                  {(i + 1) * 12}
                </div>
              </div>

              {/* Page back face */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "0 6px 6px 0",
                  background: "#f4f5f7",
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              />
            </div>
          ))}

          {/* ── Front cover — this is the one that opens ── */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              transformOrigin: "left center",
              transform: `rotateY(${coverAngle}deg)`,
              transformStyle: "preserve-3d",
              willChange: "transform",
              zIndex: 20,
            }}
          >
            {/* Cover front face */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(150deg, ${coverColorFrom} 0%, ${coverColorTo} 100%)`,
                borderRadius: "2px 8px 8px 2px",
                backfaceVisibility: "hidden",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "clamp(16px,2.2vw,24px) clamp(14px,2vw,20px)",
                boxShadow: `inset 4px 0 15px rgba(255,255,255,0.05), inset -1px 0 0 rgba(0,0,0,0.6), 4px 0 24px rgba(0,0,0,0.5)`,
              }}
            >
              {/* Subtle noise texture */}
              <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
                <defs>
                  <filter id="cover-grain-modern">
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency="0.9"
                      numOctaves={4}
                      stitchTiles="stitch"
                    />
                    <feColorMatrix type="saturate" values="0" />
                    <feBlend in="SourceGraphic" mode="overlay" />
                  </filter>
                </defs>
              </svg>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  filter: "url(#cover-grain-modern)",
                  opacity: 0.04,
                  background: "#fff",
                  pointerEvents: "none",
                }}
              />

              {/* Accent edge line (left side — modern binding) */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: `linear-gradient(to bottom, ${accentColor}80, ${accentColor}20)`,
                  borderRadius: "2px 0 0 2px",
                }}
              />

              {/* Top section — brand badge */}
              <div
                style={{
                  paddingLeft: 8,
                }}
              >
                {/* Small accent bar */}
                <div
                  style={{
                    width: 24,
                    height: 2,
                    background: accentColor,
                    marginBottom: 10,
                    borderRadius: 1,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "clamp(6px,0.8vw,8px)",
                    color: "rgba(255,255,255,0.35)",
                    letterSpacing: "3px",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  BookPrinta
                </span>
              </div>

              {/* Center — geometric logo mark */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: "clamp(36px,5vw,48px)",
                    height: "clamp(36px,5vw,48px)",
                    border: `1.5px solid ${accentColor}60`,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "clamp(14px,2vw,20px)",
                      fontWeight: 700,
                      color: accentColor,
                      letterSpacing: "-1px",
                    }}
                  >
                    B
                  </div>
                  {/* Inner ring */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 4,
                      border: `0.5px solid ${accentColor}30`,
                      borderRadius: "50%",
                    }}
                  />
                </div>
              </div>

              {/* Bottom — title + author */}
              <div style={{ paddingLeft: 8 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(13px,1.8vw,18px)",
                    fontWeight: 800,
                    color: "#ffffff",
                    lineHeight: 1.15,
                    letterSpacing: "-.3px",
                    marginBottom: 8,
                    whiteSpace: "pre-line",
                  }}
                >
                  {title}
                </div>
                {/* Thin separator */}
                <div
                  style={{
                    width: 32,
                    height: 1,
                    background: `${accentColor}40`,
                    marginBottom: 8,
                  }}
                />
                <div
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "clamp(6px,0.7vw,7.5px)",
                    color: "rgba(255,255,255,0.3)",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    fontWeight: 400,
                  }}
                >
                  {author}
                </div>
              </div>
            </div>

            {/* Cover inside face (visible when open) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: insideGradient,
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                borderRadius: "2px 8px 8px 2px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "60%",
                  height: "60%",
                  border: `1px solid ${accentColor}15`,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 7,
                    color: `${accentColor}30`,
                    letterSpacing: "3px",
                    textTransform: "uppercase",
                    transform: "rotate(-90deg)",
                    fontWeight: 500,
                  }}
                >
                  BookPrinta
                </span>
              </div>
            </div>
          </div>

          {/* Spine */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "clamp(20px,2.8vw,26px)",
              background: spineGradient,
              transform: "rotateY(90deg)",
              transformOrigin: "left center",
              boxShadow: "-4px 0 14px rgba(0,0,0,.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {/* Accent strip on spine */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 2,
                background: `linear-gradient(to bottom, ${accentColor}50, ${accentColor}10)`,
              }}
            />
            <span
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                transform: "rotate(180deg)",
                fontFamily: "var(--font-display)",
                fontSize: 6.5,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: "2.5px",
                whiteSpace: "nowrap",
                fontWeight: 600,
              }}
            >
              BOOKPRINTA
            </span>
          </div>
        </div>

        {/* Ground shadow */}
        <div
          style={{
            position: "absolute",
            bottom: "clamp(-30px,-4vw,-22px)",
            left: "50%",
            transform: `translateX(calc(-50% + ${shadowX}px))`,
            width: shadowW,
            height: shadowH,
            background: `radial-gradient(ellipse, ${accentColor}15 0%, rgba(0,0,0,0.5) 30%, transparent 75%)`,
            filter: "blur(12px)",
            opacity: shadowOpacity,
            willChange: "transform, opacity, width",
            transition: "none",
          }}
        />
      </div>
    </div>
  );
}
