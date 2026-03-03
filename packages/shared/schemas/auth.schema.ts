import { z } from "zod";

// ==========================================
// Auth Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

/**
 * POST /auth/signup/finish
 * Complete account setup — set password after payment
 */
export const FinishSignupSchema = z
  .object({
    token: z.string().min(1, "Token is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type FinishSignupInput = z.infer<typeof FinishSignupSchema>;

/**
 * POST /auth/verify-email
 * Verify 6-digit email code
 */
export const VerifyEmailSchema = z.object({
  email: z.email("Invalid email address"),
  code: z
    .string()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d{6}$/, "Code must be 6 digits"),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

/**
 * POST /auth/verify-email-link
 * Verify email directly from tokenized link
 */
export const VerifyEmailLinkSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export type VerifyEmailLinkInput = z.infer<typeof VerifyEmailLinkSchema>;

/**
 * POST /auth/login
 * Login with email/phone & password
 */
export const LoginSchema = z.object({
  identifier: z
    .string()
    .min(1, "Email or phone number is required")
    .refine(
      (value) => {
        const trimmed = value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const digits = trimmed.replace(/\D/g, "");
        const looksLikePhone = digits.length >= 7 && digits.length <= 15;
        return emailRegex.test(trimmed) || looksLikePhone;
      },
      { message: "Enter a valid email address or phone number" }
    ),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
  recaptchaToken: z.string().min(1, "reCAPTCHA verification failed"),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * POST /auth/forgot-password
 * Send password reset email
 */
export const ForgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
  recaptchaToken: z.string().min(1, "reCAPTCHA verification failed"),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

/**
 * GET /auth/reset-password?token=...
 * Validate password reset token before showing reset form
 */
export const ValidateResetPasswordTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export type ValidateResetPasswordTokenInput = z.infer<typeof ValidateResetPasswordTokenSchema>;

/**
 * POST /auth/reset-password
 * Reset password with token
 */
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

/**
 * POST /auth/resend-signup-link
 * Resend signup link (rate limited: 3/hour)
 */
export const ResendSignupLinkSchema = z.object({
  email: z.email("Invalid email address"),
});

export type ResendSignupLinkInput = z.infer<typeof ResendSignupLinkSchema>;

/**
 * POST /auth/signup/context
 * Resolve prefill data for /signup/finish
 */
export const SignupContextSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export type SignupContextInput = z.infer<typeof SignupContextSchema>;
