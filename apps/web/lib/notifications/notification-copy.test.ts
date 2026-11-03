import { translateNotificationCopy } from "./notification-copy";

function translatorWith(messages: Record<string, string>) {
  const translate = ((key: string, params?: Record<string, unknown>) => {
    const template = messages[key] ?? key; // next-intl returns the key path when missing
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ""));
  }) as unknown as Parameters<typeof translateNotificationCopy>[0];
  Object.assign(translate, { has: (key: string) => key in messages });
  return translate;
}

describe("translateNotificationCopy", () => {
  const translate = translatorWith({
    "notifications.order_status.title": "Order update",
    "notifications.order_status.message": "Order {orderNumber} has a new status update.",
    "notifications.generic.title": "Notification",
    "notifications.generic.message": "You have a new update.",
  });

  it("translates a known key with its params", () => {
    expect(
      translateNotificationCopy(
        translate,
        "notifications.order_status.message",
        { orderNumber: "BP-2026-0001" },
        "message"
      )
    ).toBe("Order BP-2026-0001 has a new status update.");
  });

  it("never shows a raw key path when a key is missing", () => {
    expect(
      translateNotificationCopy(translate, "notifications.not_shipped_yet.title", {}, "title")
    ).toBe("Notification");
    expect(
      translateNotificationCopy(translate, "notifications.not_shipped_yet.message", {}, "message")
    ).toBe("You have a new update.");
  });
});
