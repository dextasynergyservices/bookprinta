type RenderedEmail = {
  subject: string;
  html: string;
};

const buildRenderedEmail = (subject: string): RenderedEmail => ({
  subject,
  html: `<p>${subject}</p>`,
});

export const renderPasswordResetEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Password reset");

export const renderSignupLinkEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Signup link");

export const renderSignupVerificationEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Signup verification");

export const renderWelcomeEmail = async (): Promise<RenderedEmail> => buildRenderedEmail("Welcome");

export const renderBankTransferUserEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Bank transfer");

export const renderBankTransferAdminEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Bank transfer admin");

export const renderNewBookOrderUserEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("New book user");

export const renderNewBookOrderAdminEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("New book admin");

export const renderContactAdminEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Contact admin");

export const renderContactConfirmEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Contact confirm");

export const renderQuoteReceivedEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Quote received");

export const renderQuoteAdminNotificationEmail = async (): Promise<RenderedEmail> =>
  buildRenderedEmail("Quote admin");
