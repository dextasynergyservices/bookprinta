const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

const BLOCK_TAG_PATTERN =
  /<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|option|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

const SELF_CLOSING_BLOCK_TAG_PATTERN =
  /<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|option|link|meta|base)[^>]*\/\s*>/gi;

const EVENT_HANDLER_PATTERN = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

const BLOCKED_PROTOCOL_ATTRIBUTE_PATTERN =
  /\s+(href|src)\s*=\s*(?:"\s*(javascript:|data:|vbscript:)[^"]*"|'\s*(javascript:|data:|vbscript:)[^']*'|\s*(javascript:|data:|vbscript:)[^\s>]+)/gi;

function extractBodyContent(content: string): string {
  const match = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  return content.trim();
}

export function sanitizeBookPreviewHtml(content: string): string {
  if (!content) return "";

  let html = extractBodyContent(content);
  html = html.replace(COMMENT_PATTERN, "");
  html = html.replace(BLOCK_TAG_PATTERN, "");
  html = html.replace(SELF_CLOSING_BLOCK_TAG_PATTERN, "");
  html = html.replace(EVENT_HANDLER_PATTERN, "");
  html = html.replace(BLOCKED_PROTOCOL_ATTRIBUTE_PATTERN, "");

  return html.trim();
}
