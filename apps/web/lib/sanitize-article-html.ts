const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

const BLOCK_TAG_PATTERN =
  /<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|option|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

const SELF_CLOSING_BLOCK_TAG_PATTERN =
  /<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|option|link|meta|base)[^>]*\/\s*>/gi;

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "img",
  "pre",
  "code",
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function extractAttribute(attributes: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attributes.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function sanitizeHref(rawHref: string | null): string {
  if (!rawHref) return "#";

  const href = rawHref.trim();
  if (!href) return "#";

  const lowercaseHref = href.toLowerCase();
  const isBlockedProtocol =
    lowercaseHref.startsWith("javascript:") ||
    lowercaseHref.startsWith("data:") ||
    lowercaseHref.startsWith("vbscript:") ||
    lowercaseHref.startsWith("file:");

  if (isBlockedProtocol) return "#";

  return href;
}

function sanitizeSrc(rawSrc: string | null): string | null {
  if (!rawSrc) return null;

  const src = rawSrc.trim();
  if (!src) return null;

  if (src.startsWith("/")) {
    return src;
  }

  const lowercaseSrc = src.toLowerCase();
  const isBlockedProtocol =
    lowercaseSrc.startsWith("javascript:") ||
    lowercaseSrc.startsWith("data:") ||
    lowercaseSrc.startsWith("vbscript:") ||
    lowercaseSrc.startsWith("file:");

  if (isBlockedProtocol) return null;

  try {
    const parsed = new URL(src);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeImageAlign(rawAlign: string | null): "left" | "center" | "right" {
  if (rawAlign === "left" || rawAlign === "center" || rawAlign === "right") {
    return rawAlign;
  }

  return "center";
}

function sanitizeImageWidth(rawWidth: string | null): number {
  if (!rawWidth) return 100;

  const parsed = Number.parseInt(rawWidth, 10);
  if (!Number.isFinite(parsed)) return 100;

  return Math.min(100, Math.max(30, parsed));
}

function isLikelyHtml(content: string): boolean {
  return /<\s*\/?\s*[a-z][^>]*>/i.test(content);
}

function plainTextToHtml(content: string): string {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  if (paragraphs.length === 0) return "";

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

export function sanitizeArticleHtml(content: string): string {
  if (!content) return "";

  if (!isLikelyHtml(content)) {
    return plainTextToHtml(content);
  }

  let html = content;
  html = html.replace(COMMENT_PATTERN, "");
  html = html.replace(BLOCK_TAG_PATTERN, "");
  html = html.replace(SELF_CLOSING_BLOCK_TAG_PATTERN, "");

  const sanitized = html.replace(
    /<\s*(\/?)\s*([a-z0-9-]+)([^>]*)>/gi,
    (_full, slash, rawTag, attrs) => {
      const tag = String(rawTag).toLowerCase();
      const isClosing = slash === "/";

      if (!ALLOWED_TAGS.has(tag)) {
        return "";
      }

      if (isClosing) {
        if (tag === "br") return "";
        if (tag === "img") return "";
        return `</${tag}>`;
      }

      if (tag === "br") return "<br />";

      if (tag === "a") {
        const href = sanitizeHref(extractAttribute(String(attrs), "href"));
        const isExternal = /^https?:\/\//i.test(href);
        const rel = isExternal ? ' rel="noopener noreferrer nofollow"' : "";
        const target = isExternal ? ' target="_blank"' : "";
        return `<a href="${escapeAttribute(href)}"${target}${rel}>`;
      }

      if (tag === "img") {
        const src = sanitizeSrc(extractAttribute(String(attrs), "src"));
        if (!src) return "";

        const alt = extractAttribute(String(attrs), "alt") ?? "";
        const title = extractAttribute(String(attrs), "title");
        const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
        const align = sanitizeImageAlign(extractAttribute(String(attrs), "data-align"));
        const width = sanitizeImageWidth(extractAttribute(String(attrs), "data-width"));

        return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" data-align="${align}" data-width="${width}" style="width:${width}%;height:auto;" loading="lazy" decoding="async"${titleAttribute} />`;
      }

      return `<${tag}>`;
    }
  );

  return sanitized.trim();
}
