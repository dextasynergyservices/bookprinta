/**
 * Pre-rendered email helpers for server-side consumers (e.g., NestJS API).
 *
 * These functions encapsulate React rendering so the API doesn't need
 * JSX/TSX support — it just gets back an HTML string.
 */
import { render } from "@react-email/components";
import { ContactAdminEmail } from "./emails/ContactAdminEmail";
import { ContactConfirmationEmail } from "./emails/ContactConfirmationEmail";
import type { Locale } from "./translations/index";
import { getEmailSubject } from "./translations/index";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RenderContactAdminProps {
  locale?: Locale;
  fullName: string;
  email: string;
  phone?: string;
  subject: string;
  subjectLabel: string;
  message: string;
  submissionId: string;
  adminPanelUrl: string;
}

export interface RenderContactConfirmProps {
  locale?: Locale;
  firstName: string;
  subject: string;
  subjectLabel: string;
  message: string;
  dashboardUrl?: string;
}

// ── Render helpers ───────────────────────────────────────────────────────────

export async function renderContactAdminEmail(
  props: RenderContactAdminProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(ContactAdminEmail(props));
  return { html, subject: getEmailSubject("contact_admin", locale) };
}

export async function renderContactConfirmEmail(
  props: RenderContactConfirmProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(ContactConfirmationEmail(props));
  return { html, subject: getEmailSubject("contact_confirm", locale) };
}
