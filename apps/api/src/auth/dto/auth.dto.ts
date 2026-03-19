import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// ==========================================
// Zod Schemas — Source of truth for auth validation
//
// NOTE: These schemas are duplicated in packages/shared/schemas/auth.schema.ts
// for consumption by the frontend. Keep them in sync.
// ==========================================

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

export const VerifyEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z
    .string()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const VerifyEmailLinkSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

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

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  recaptchaToken: z.string().min(1, "reCAPTCHA verification failed"),
});

export const ValidateResetPasswordTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  recaptchaToken: z.string().min(1, "reCAPTCHA verification failed").optional(),
});

export const ResendSignupLinkSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const SignupContextSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

// ==========================================
// Auth DTOs — Derived from Zod schemas above
// Used for NestJS validation + Swagger docs
// ==========================================

export class FinishSignupDto extends createZodDto(FinishSignupSchema) {}

export class VerifyEmailDto extends createZodDto(VerifyEmailSchema) {}

export class VerifyEmailLinkDto extends createZodDto(VerifyEmailLinkSchema) {}

export class LoginDto extends createZodDto(LoginSchema) {}

export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}

export class ValidateResetPasswordTokenDto extends createZodDto(ValidateResetPasswordTokenSchema) {}

export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}

export class ResendSignupLinkDto extends createZodDto(ResendSignupLinkSchema) {}

export class SignupContextDto extends createZodDto(SignupContextSchema) {}
