// Email templates

export { EmailButton } from "./components/EmailButton";
export { EmailHeading } from "./components/EmailHeading";
// Shared components
export { EmailLayout } from "./components/EmailLayout";
export { BankTransferAdminEmail } from "./emails/BankTransferAdminEmail";
export { BankTransferUserEmail } from "./emails/BankTransferUserEmail";
export { BookStatusEmail } from "./emails/BookStatusEmail";
export { ContactAdminEmail } from "./emails/ContactAdminEmail";
export { ContactConfirmationEmail } from "./emails/ContactConfirmationEmail";
export { ManuscriptRejectedEmail } from "./emails/ManuscriptRejectedEmail";
export { PasswordResetEmail } from "./emails/PasswordResetEmail";
export { ProductionDelayEmail } from "./emails/ProductionDelayEmail";
export { ProfileCompleteBannerEmail } from "./emails/ProfileCompleteBannerEmail";
export { QuoteAdminNotificationEmail } from "./emails/QuoteAdminNotificationEmail";
export { QuoteProposalEmail } from "./emails/QuoteProposalEmail";
export { QuoteReceivedEmail } from "./emails/QuoteReceivedEmail";
export { RefundConfirmEmail } from "./emails/RefundConfirmEmail";
export { ReprintConfirmEmail } from "./emails/ReprintConfirmEmail";
export { ReviewRequestEmail } from "./emails/ReviewRequestEmail";
export { SignupLinkEmail } from "./emails/SignupLinkEmail";
export { WelcomeEmail } from "./emails/WelcomeEmail";
export type { Locale } from "./translations/index";
// Translation utilities
export { getEmailSubject, t } from "./translations/index";
