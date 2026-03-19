export type UserNotificationPreferenceKind =
  | "bank_transfer_receipt"
  | "bank_transfer_rejected"
  | "book_status_update"
  | "manuscript_rejected"
  | "order_status_update"
  | "password_reset"
  | "payment_confirmation"
  | "production_delay"
  | "refund_confirmation"
  | "review_request"
  | "shipping_notification"
  | "signup_link"
  | "signup_verification"
  | "system"
  | "welcome";

const CRITICAL_USER_NOTIFICATION_KINDS = new Set<UserNotificationPreferenceKind>([
  "bank_transfer_receipt",
  "password_reset",
  "signup_link",
  "signup_verification",
]);

export function isCriticalUserNotificationKind(kind: UserNotificationPreferenceKind): boolean {
  return CRITICAL_USER_NOTIFICATION_KINDS.has(kind);
}

export function isUserNotificationChannelEnabled(params: {
  enabled?: boolean | null;
  kind: UserNotificationPreferenceKind;
  bypassPreference?: boolean;
}): boolean {
  if (params.bypassPreference || isCriticalUserNotificationKind(params.kind)) {
    return true;
  }

  return params.enabled !== false;
}
