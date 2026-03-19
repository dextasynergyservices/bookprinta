import sanitize from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "img",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "strong",
  "em",
  "br",
];

const ALLOWED_ATTRIBUTES: sanitize.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height"],
};

/**
 * Sanitize untrusted HTML content for safe storage.
 * Strips all tags/attributes not in the whitelist.
 */
export function sanitizeHtmlContent(dirty: string): string {
  return sanitize(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https"],
    enforceHtmlBoundary: false,
  });
}
