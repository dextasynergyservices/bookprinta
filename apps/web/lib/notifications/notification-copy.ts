import type { NotificationItem } from "@bookprinta/shared";
import type { useTranslations } from "next-intl";

type Translator = ReturnType<typeof useTranslations>;

/**
 * Title or message of an in-app notification in the viewer's language.
 *
 * The API stores translation keys, not copy. If a key is missing from the
 * message files, next-intl returns the key path itself (e.g.
 * "notifications.job_failed.title") instead of throwing, so a missing key is
 * detected up front and replaced with generic, translated copy.
 */
export function translateNotificationCopy(
  translate: Translator,
  key: string,
  params: NotificationItem["data"]["params"] | undefined,
  part: "title" | "message"
): string {
  // Test doubles of useTranslations are often bare functions without `has`.
  const has = (translate as Partial<Pick<Translator, "has">>).has;
  if (typeof has === "function" && !has(key as never)) {
    return translate(`notifications.generic.${part}` as never);
  }
  return translate(key as never, params as never);
}
