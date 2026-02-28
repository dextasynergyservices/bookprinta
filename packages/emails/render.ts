/**
 * Pre-rendered email helpers for server-side consumers (e.g., NestJS API).
 *
 * These functions encapsulate React rendering so the API doesn't need
 * JSX/TSX support — it just gets back an HTML string.
 */
import { render } from "@react-email/components";
import { BankTransferAdminEmail } from "./emails/BankTransferAdminEmail.tsx";
import { BankTransferUserEmail } from "./emails/BankTransferUserEmail.tsx";
import { ContactAdminEmail } from "./emails/ContactAdminEmail.tsx";
import { ContactConfirmationEmail } from "./emails/ContactConfirmationEmail.tsx";
import { SignupLinkEmail } from "./emails/SignupLinkEmail.tsx";
import { SignupVerificationEmail } from "./emails/SignupVerificationEmail.tsx";
import { WelcomeEmail } from "./emails/WelcomeEmail.tsx";
import type { Locale } from "./translations/index.ts";
import { getEmailSubject } from "./translations/index.ts";

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

export interface RenderBankTransferUserProps {
  locale?: Locale;
  userName: string;
  orderNumber: string;
  amount: string;
}

export interface RenderBankTransferAdminProps {
  locale?: Locale;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  amount: string;
  orderNumber: string;
  receiptUrl: string;
  adminPanelUrl: string;
}

export interface RenderSignupLinkProps {
  locale?: Locale;
  userName: string;
  signupUrl: string;
}

export interface RenderSignupVerificationProps {
  locale?: Locale;
  userName: string;
  verificationCode: string;
  verificationToken: string;
  verificationUrl: string;
}

export interface RenderWelcomeProps {
  locale?: Locale;
  userName: string;
  signupUrl: string;
  orderNumber?: string;
  packageName?: string;
  amountPaid?: string;
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

export async function renderBankTransferUserEmail(
  props: RenderBankTransferUserProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(BankTransferUserEmail(props));
  return {
    html,
    subject: getEmailSubject("bank_transfer_user", locale, {
      orderNumber: props.orderNumber,
    }),
  };
}

export async function renderBankTransferAdminEmail(
  props: RenderBankTransferAdminProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(BankTransferAdminEmail(props));
  return {
    html,
    subject: getEmailSubject("bank_transfer_admin", locale, {
      orderNumber: props.orderNumber,
    }),
  };
}

export async function renderSignupLinkEmail(
  props: RenderSignupLinkProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(SignupLinkEmail(props));
  return {
    html,
    subject: getEmailSubject("signup_link", locale),
  };
}

export async function renderSignupVerificationEmail(
  props: RenderSignupVerificationProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(SignupVerificationEmail(props));
  return {
    html,
    subject: getEmailSubject("signup_verification", locale),
  };
}

export async function renderWelcomeEmail(
  props: RenderWelcomeProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(WelcomeEmail(props));
  return {
    html,
    subject: getEmailSubject("welcome", locale),
  };
}
