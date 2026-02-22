// Email templates

export { EmailButton } from "./components/EmailButton.tsx";
export { EmailHeading } from "./components/EmailHeading.tsx";
// Shared components
export { EmailLayout } from "./components/EmailLayout.tsx";
export { BankTransferAdminEmail } from "./emails/BankTransferAdminEmail.tsx";
export { BankTransferUserEmail } from "./emails/BankTransferUserEmail.tsx";
export { BookStatusEmail } from "./emails/BookStatusEmail.tsx";
export { ContactAdminEmail } from "./emails/ContactAdminEmail.tsx";
export { ContactConfirmationEmail } from "./emails/ContactConfirmationEmail.tsx";
export { ManuscriptRejectedEmail } from "./emails/ManuscriptRejectedEmail.tsx";
export { PasswordResetEmail } from "./emails/PasswordResetEmail.tsx";
export { ProductionDelayEmail } from "./emails/ProductionDelayEmail.tsx";
export { ProfileCompleteBannerEmail } from "./emails/ProfileCompleteBannerEmail.tsx";
export { QuoteAdminNotificationEmail } from "./emails/QuoteAdminNotificationEmail.tsx";
export { QuoteProposalEmail } from "./emails/QuoteProposalEmail.tsx";
export { QuoteReceivedEmail } from "./emails/QuoteReceivedEmail.tsx";
export { RefundConfirmEmail } from "./emails/RefundConfirmEmail.tsx";
export { ReprintConfirmEmail } from "./emails/ReprintConfirmEmail.tsx";
export { ReviewRequestEmail } from "./emails/ReviewRequestEmail.tsx";
export { SignupLinkEmail } from "./emails/SignupLinkEmail.tsx";
export { WelcomeEmail } from "./emails/WelcomeEmail.tsx";
export type { Locale } from "./translations/index.ts";
// Translation utilities
export { getEmailSubject, t } from "./translations/index.ts";
