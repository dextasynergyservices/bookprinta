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
 * POST /auth/login
 * Login with email & password
 */
export const LoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * POST /auth/forgot-password
 * Send password reset email
 */
export const ForgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

/**
 * POST /auth/reset-password
 * Reset password with token
 */
export const ResetPasswordSchema = z
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
