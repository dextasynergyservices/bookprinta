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
import { PasswordResetEmail } from "./emails/PasswordResetEmail.tsx";
import { QuoteAdminNotificationEmail } from "./emails/QuoteAdminNotificationEmail.tsx";
import { QuoteReceivedEmail } from "./emails/QuoteReceivedEmail.tsx";
import { SignupLinkEmail } from "./emails/SignupLinkEmail.tsx";
import { SignupVerificationEmail } from "./emails/SignupVerificationEmail.tsx";
import { WelcomeEmail } from "./emails/WelcomeEmail.tsx";
import type { Locale } from "./translations/index.ts";
import { getEmailSubject, t } from "./translations/index.ts";

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
  packageName?: string;
  addons?: string[];
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
  orderNumber?: string;
  packageName?: string;
  amountPaid?: string;
  addons?: string[];
}

export interface RenderSignupVerificationProps {
  locale?: Locale;
  userName: string;
  verificationCode: string;
  verificationUrl: string;
}

export interface RenderWelcomeProps {
  locale?: Locale;
  userName: string;
  dashboardUrl: string;
  orderNumber?: string;
  packageName?: string;
  amountPaid?: string;
  addons?: string[];
}

export interface RenderPasswordResetProps {
  locale?: Locale;
  userName: string;
  resetUrl: string;
}

export type QuoteBookSize = "A4" | "A5" | "A6";
export type QuoteCoverType = "paperback" | string;
export type QuoteSpecialRequirement =
  | "hardback"
  | "embossing"
  | "gold_foil"
  | "special_size"
  | "full_color_interior"
  | "special_paper"
  | "other"
  | string;

export interface RenderQuoteReceivedProps {
  locale?: Locale;
  referenceNumber: string;
  userName: string;
  email: string;
  phone: string;
  workingTitle: string;
  estimatedWordCount: number;
  bookSize: QuoteBookSize;
  quantity: number;
  coverType?: QuoteCoverType;
  hasSpecialReqs: boolean;
  specialRequirements?: QuoteSpecialRequirement[];
  specialRequirementsOther?: string | null;
  estimatedPriceLow?: number | null;
  estimatedPriceHigh?: number | null;
}

export interface RenderQuoteAdminNotificationProps {
  locale?: Locale;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string;
  workingTitle: string;
  estimatedWordCount: number;
  bookSize: QuoteBookSize;
  quantity: number;
  coverType?: QuoteCoverType;
  hasSpecialReqs: boolean;
  specialRequirements?: QuoteSpecialRequirement[];
  specialRequirementsOther?: string | null;
  estimatedPriceLow?: number | null;
  estimatedPriceHigh?: number | null;
  adminPanelUrl: string;
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

export async function renderPasswordResetEmail(
  props: RenderPasswordResetProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(PasswordResetEmail(props));
  return {
    html,
    subject: getEmailSubject("password_reset", locale),
  };
}

export async function renderQuoteReceivedEmail(
  props: RenderQuoteReceivedProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(QuoteReceivedEmail(props));
  return {
    html,
    subject: getEmailSubject("quote_received", locale),
  };
}

export async function renderQuoteAdminNotificationEmail(
  props: RenderQuoteAdminNotificationProps
): Promise<{ html: string; subject: string }> {
  const locale = props.locale ?? "en";
  const html = await render(QuoteAdminNotificationEmail(props));
  const reference = props.referenceNumber;

  const subject = props.hasSpecialReqs
    ? t(locale, "quote_admin", "subject_special_requirements", { reference })
    : props.estimatedPriceLow != null && props.estimatedPriceHigh != null
      ? t(locale, "quote_admin", "subject_with_estimate", {
          reference,
          estimatedLow: formatNaira(props.estimatedPriceLow),
          estimatedHigh: formatNaira(props.estimatedPriceHigh),
        })
      : t(locale, "quote_admin", "subject", { reference });

  return {
    html,
    subject,
  };
}

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}
