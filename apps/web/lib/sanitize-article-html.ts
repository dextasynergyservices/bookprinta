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

      return `<${tag}>`;
    }
  );

  return sanitized.trim();
}
