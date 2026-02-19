import en from "./en.json" with { type: "json" };
import es from "./es.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };

export type Locale = "en" | "fr" | "es";

type TranslationNamespace = keyof typeof en;

const translations: Record<Locale, typeof en> = { en, fr, es };

/**
 * Get a translated string by namespace and key.
 * Supports interpolation with `{variable}` placeholders.
 *
 * @example
 * t("en", "common", "greeting", { name: "John" }) // "Hi John,"
 * t("fr", "welcome", "subject") // "Bienvenue sur BookPrinta - Completez votre compte"
 */
export function t(
  locale: Locale,
  namespace: TranslationNamespace,
  key: string,
  vars?: Record<string, string | number>
): string {
  const ns = translations[locale]?.[namespace] ?? translations.en[namespace];
  const value =
    (ns as Record<string, string>)?.[key] ??
    (translations.en[namespace] as Record<string, string>)?.[key] ??
    key;

  if (!vars) return value;

  return value.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/**
 * Get the email subject for a given template namespace.
 */
export function getEmailSubject(
  namespace: TranslationNamespace,
  locale: Locale,
  vars?: Record<string, string | number>
): string {
  return t(locale, namespace, "subject", vars);
}
