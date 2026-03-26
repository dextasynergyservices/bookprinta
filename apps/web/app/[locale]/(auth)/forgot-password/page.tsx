"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { RecaptchaProvider } from "@/components/shared/RecaptchaProvider";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const RATE_LIMIT_FALLBACK_SECONDS = 180;

type ForgotPasswordErrorResponse = {
  message?: string | string[];
  errorCode?: string;
  retryAfterSeconds?: number;
};

function getApiV1BaseUrl() {
  if (typeof window !== "undefined") return "/api/v1";

  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveRetryAfterSeconds(
  response: Response,
  payload: ForgotPasswordErrorResponse | null
): number {
  if (typeof payload?.retryAfterSeconds === "number" && payload.retryAfterSeconds > 0) {
    return payload.retryAfterSeconds;
  }

  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const parsed = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return RATE_LIMIT_FALLBACK_SECONDS;
}

function SuccessCheckmark() {
  return (
    <motion.svg
      width="76"
      height="76"
      viewBox="0 0 76 76"
      fill="none"
      aria-hidden="true"
      className="mx-auto"
    >
      <motion.circle
        cx="38"
        cy="38"
        r="34"
        stroke="#007eff"
        strokeWidth="2.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT }}
      />
      <motion.path
        d="M24 39.5L33.5 49L53 29.5"
        stroke="#007eff"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.25 }}
      />
    </motion.svg>
  );
}

function ForgotPasswordPageInner() {
  const t = useTranslations("auth");
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    if (rateLimitSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRateLimitSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [rateLimitSeconds]);

  const validateEmail = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return t("forgot_password_validation_email_required");
    if (!isValidEmail(normalized)) return t("forgot_password_validation_email_invalid");
    return "";
  };

  const onEmailBlur = () => {
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  };

  const requestPasswordReset = async (
    targetEmail: string
  ): Promise<{ retrySeconds: number; errorCode?: string }> => {
    let recaptchaToken = "dev-token";
    if (executeRecaptcha) {
      recaptchaToken = await executeRecaptcha("forgot_password_form");
    }

    const response = await fetch(`${getApiV1BaseUrl()}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: targetEmail,
        recaptchaToken,
      }),
    });

    const payload = (await response.json().catch(() => null)) as ForgotPasswordErrorResponse | null;

    if (response.status === 429 || payload?.errorCode === "AUTH_FORGOT_PASSWORD_RATE_LIMIT") {
      return { retrySeconds: resolveRetryAfterSeconds(response, payload) };
    }

    if (!response.ok) {
      return { retrySeconds: 0, errorCode: payload?.errorCode || "UNKNOWN" };
    }

    return { retrySeconds: 0 };
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setEmailTouched(true);
    setFormError("");
    setResendStatus("");
    setRateLimitSeconds(0);

    const validationError = validateEmail(email);
    setEmailError(validationError);
    if (validationError) return;

    setIsSubmitting(true);
    setSubmittedEmail(normalizedEmail);
    try {
      const result = await requestPasswordReset(normalizedEmail);

      if (result.errorCode === "AUTH_RECAPTCHA_FAILED") {
        setFormError(t("forgot_password_error_recaptcha"));
        return;
      }

      if (result.errorCode) {
        setFormError(t("forgot_password_error_generic"));
        return;
      }

      setRateLimitSeconds(result.retrySeconds);
      setIsSuccess(true);
    } catch {
      setFormError(t("forgot_password_error_generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendResetLink = async () => {
    if (!submittedEmail || isResending || rateLimitSeconds > 0) return;

    setResendStatus("");
    setIsResending(true);
    try {
      const result = await requestPasswordReset(submittedEmail);

      if (result.errorCode === "AUTH_RECAPTCHA_FAILED") {
        setResendStatus(t("forgot_password_error_recaptcha"));
        return;
      }

      if (result.errorCode) {
        setResendStatus(t("forgot_password_error_generic"));
        return;
      }

      if (result.retrySeconds > 0) {
        setRateLimitSeconds(result.retrySeconds);
        setResendStatus(t("forgot_password_resend_wait", { seconds: result.retrySeconds }));
        return;
      }

      setResendStatus(t("forgot_password_resend_success"));
    } catch {
      setResendStatus(t("forgot_password_error_generic"));
    } finally {
      setIsResending(false);
    }
  };

  const resendDisabled = isResending || rateLimitSeconds > 0;
  const resendText =
    rateLimitSeconds > 0
      ? t("forgot_password_resend_wait", { seconds: rateLimitSeconds })
      : isResending
        ? t("forgot_password_resending")
        : t("forgot_password_resend");

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <Link
        href="/"
        aria-label={t("login_home_aria_label")}
        className="absolute top-5 left-4 z-10 inline-flex sm:top-6 sm:left-6"
      >
        <Image
          src="/logo-main-white.png"
          alt={t("login_brand_alt")}
          width={154}
          height={42}
          priority
          className="h-8 w-auto sm:h-9"
        />
      </Link>

      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(65% 45% at 50% 0%, rgba(0,126,255,0.15) 0%, rgba(0,0,0,0) 75%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] items-center px-4 py-8 sm:px-6 sm:py-12">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE_OUT }}
          className="w-full rounded-[28px] border border-[#2A2A2A] bg-[#050505] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.55)] sm:p-8"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isSuccess ? (
              <motion.div
                key="forgot-password-success"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="text-center"
              >
                <SuccessCheckmark />
                <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {t("forgot_password_success_title")}
                </h1>
                <p className="mt-3 font-serif text-base leading-relaxed text-[#ededed]">
                  {t("forgot_password_success_body", { email: submittedEmail })}
                </p>

                <button
                  type="button"
                  onClick={resendResetLink}
                  disabled={resendDisabled}
                  className={cn(
                    "mt-7 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-5 font-sans text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]",
                    resendDisabled
                      ? "cursor-not-allowed border-[#2A2A2A] text-white/45"
                      : "border-[#007eff] text-[#007eff] hover:bg-[#007eff]/10"
                  )}
                >
                  {resendText}
                </button>

                {resendStatus ? (
                  <p className="mt-3 font-sans text-xs text-white/70" aria-live="polite">
                    {resendStatus}
                  </p>
                ) : null}

                <Link
                  href="/login"
                  className="mt-6 inline-flex rounded-sm px-1 font-sans text-xs font-medium text-[#007eff] transition-colors duration-150 hover:text-[#4da2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                >
                  {t("forgot_password_back_to_login")}
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="forgot-password-form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              >
                <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {t("forgot_password_title")}
                </h1>
                <p className="mt-3 font-serif text-base leading-relaxed text-[#ededed]">
                  {t("forgot_password_subtitle")}
                </p>

                <form noValidate onSubmit={onSubmit} className="mt-8 space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="forgot-password-email"
                      className="font-sans text-sm font-medium text-white"
                    >
                      {t("forgot_password_email_label")}
                    </label>
                    <input
                      id="forgot-password-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEmail(value);
                        if (emailTouched) setEmailError(validateEmail(value));
                      }}
                      onBlur={onEmailBlur}
                      aria-label={t("forgot_password_email_aria_label")}
                      aria-invalid={Boolean(emailTouched && emailError)}
                      aria-describedby={
                        emailTouched && emailError ? "forgot-password-email-error" : undefined
                      }
                      placeholder={t("forgot_password_email_placeholder")}
                      className={cn(
                        "min-h-12 w-full rounded-xl border bg-black px-4 font-sans text-sm text-white placeholder:text-white/45 transition-[border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]/20",
                        emailTouched && emailError
                          ? "border-[#EF4444] focus-visible:border-[#EF4444]"
                          : "border-[#2A2A2A] focus-visible:border-[#007eff]"
                      )}
                    />
                    {emailTouched && emailError ? (
                      <p
                        id="forgot-password-email-error"
                        role="alert"
                        className="font-sans text-xs text-[#EF4444]"
                      >
                        {emailError}
                      </p>
                    ) : null}
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isSubmitting}
                    whileHover={!isSubmitting ? { scale: 1.015 } : undefined}
                    whileTap={!isSubmitting ? { scale: 0.985 } : undefined}
                    className={cn(
                      "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-bold text-white transition-[opacity,filter] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                      isSubmitting ? "cursor-not-allowed opacity-60" : "hover:brightness-110"
                    )}
                  >
                    {isSubmitting ? (
                      <>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 0.9,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "linear",
                          }}
                          className="mr-2 inline-flex"
                        >
                          <Loader2 className="size-4" aria-hidden="true" />
                        </motion.span>
                        {t("forgot_password_submitting")}
                      </>
                    ) : (
                      t("forgot_password_submit")
                    )}
                  </motion.button>

                  {formError ? (
                    <p
                      id="forgot-password-form-error"
                      role="alert"
                      className="rounded-xl border border-[#EF4444]/40 bg-[#220f12] px-4 py-3 font-sans text-sm text-[#ffb4bd]"
                    >
                      {formError}
                    </p>
                  ) : null}

                  <Link
                    href="/login"
                    className="inline-flex rounded-sm px-1 font-sans text-xs font-medium text-[#007eff] transition-colors duration-150 hover:text-[#4da2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                  >
                    {t("forgot_password_back_to_login")}
                  </Link>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <RecaptchaProvider>
      <ForgotPasswordPageInner />
    </RecaptchaProvider>
  );
}
