"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { RecaptchaProvider } from "@/components/shared/RecaptchaProvider";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const RATE_LIMIT_FALLBACK_SECONDS = 60;
const SUCCESS_REDIRECT_DELAY_MS = 2000;
const PASSWORD_STRENGTH_SEGMENTS = 4;
const PASSWORD_STRENGTH_SEGMENT_KEYS = Array.from(
  { length: PASSWORD_STRENGTH_SEGMENTS },
  (_, segmentIndex) => `reset-password-strength-${segmentIndex + 1}`
);

type ResetPasswordErrorResponse = {
  errorCode?: string;
  retryAfterSeconds?: number;
};

type FormErrors = {
  password?: string;
  confirmPassword?: string;
};

type PasswordStrength = {
  score: number;
  key: "very_weak" | "weak" | "fair" | "good" | "strong";
};

function getApiV1BaseUrl() {
  if (typeof window !== "undefined") return "/api/v1";

  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function resolveRetryAfterSeconds(
  response: Response,
  payload: ResetPasswordErrorResponse | null
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

function evaluatePasswordStrength(password: string): PasswordStrength {
  const value = password.trim();
  if (!value) return { score: 0, key: "very_weak" };

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  let score = 0;
  if (value.length >= 8) score = 1;
  if (value.length >= 8 && classes >= 2) score = 2;
  if (value.length >= 8 && classes >= 3) score = 3;
  if (value.length >= 12 && classes === 4) score = 4;

  const keyByScore: PasswordStrength["key"][] = ["very_weak", "weak", "fair", "good", "strong"];
  return { score, key: keyByScore[score] };
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
        stroke="#22c55e"
        strokeWidth="2.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT }}
      />
      <motion.path
        d="M24 39.5L33.5 49L53 29.5"
        stroke="#22c55e"
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

function ResetPasswordPageContent() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams]);

  const [viewState, setViewState] = useState<"checking" | "form" | "invalid" | "success">(
    "checking"
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const passwordStrength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordStrengthText = t(`signup_finish_password_strength_${passwordStrength.key}`);

  useEffect(() => {
    if (rateLimitSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRateLimitSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [rateLimitSeconds]);

  useEffect(() => {
    if (!token) {
      setViewState("invalid");
      return;
    }

    let cancelled = false;
    setViewState("checking");

    void (async () => {
      try {
        const response = await fetch(
          `${getApiV1BaseUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (cancelled) return;
        setViewState(response.ok ? "form" : "invalid");
      } catch {
        if (cancelled) return;
        setViewState("invalid");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (viewState !== "success") return;

    const timer = window.setTimeout(() => {
      router.replace("/login?reset=success");
    }, SUCCESS_REDIRECT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [router, viewState]);

  const validatePassword = (value: string) => {
    if (!value.trim()) return t("reset_password_validation_password_required");
    if (value.trim().length < 8) return t("reset_password_validation_password_min");
    return "";
  };

  const validateConfirmPassword = (value: string, nextPassword: string) => {
    if (!value.trim()) return t("reset_password_validation_confirm_required");
    if (value !== nextPassword) return t("reset_password_validation_confirm_mismatch");
    return "";
  };

  const validateForm = () => {
    const nextErrors: FormErrors = {};
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(confirmPassword, password);

    if (passwordError) nextErrors.password = passwordError;
    if (confirmError) nextErrors.confirmPassword = confirmError;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ password: true, confirmPassword: true });
    setFormError("");
    setRateLimitSeconds(0);

    if (!token) {
      setViewState("invalid");
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      let recaptchaToken: string | undefined;
      if (executeRecaptcha) {
        try {
          recaptchaToken = await executeRecaptcha("reset_password_form");
        } catch {
          // Allow submission to proceed — backend will skip if no token
        }
      }

      const response = await fetch(`${getApiV1BaseUrl()}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token,
          newPassword: password,
          ...(recaptchaToken ? { recaptchaToken } : {}),
        }),
      });

      if (response.ok) {
        setViewState("success");
        return;
      }

      const payload = (await response
        .json()
        .catch(() => null)) as ResetPasswordErrorResponse | null;

      if (response.status === 429 || payload?.errorCode === "AUTH_RESET_PASSWORD_RATE_LIMIT") {
        const retryAfterSeconds = resolveRetryAfterSeconds(response, payload);
        setRateLimitSeconds(retryAfterSeconds);
        setFormError(t("reset_password_rate_limit", { seconds: retryAfterSeconds }));
        return;
      }

      if (response.status === 400 || response.status === 404) {
        setViewState("invalid");
        return;
      }

      setFormError(t("reset_password_form_error_generic"));
    } catch {
      setFormError(t("reset_password_form_error_generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordError = touched.password ? errors.password : undefined;
  const confirmPasswordError = touched.confirmPassword ? errors.confirmPassword : undefined;
  const rateLimitMessage =
    rateLimitSeconds > 0
      ? t("reset_password_rate_limit", { seconds: rateLimitSeconds })
      : formError;

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
            {viewState === "checking" ? (
              <motion.div
                key="reset-password-checking"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="flex min-h-[280px] flex-col items-center justify-center text-center"
              >
                <Loader2 className="size-8 animate-spin text-[#007eff]" aria-hidden="true" />
                <p className="mt-4 font-sans text-sm text-white/75">
                  {t("reset_password_validating")}
                </p>
              </motion.div>
            ) : null}

            {viewState === "invalid" ? (
              <motion.div
                key="reset-password-invalid"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="text-center"
              >
                <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-[#EF4444]/40 bg-[#EF4444]/10">
                  <AlertTriangle className="size-8 text-[#EF4444]" aria-hidden="true" />
                </div>
                <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {t("reset_password_invalid_title")}
                </h1>
                <p className="mt-3 font-serif text-base leading-relaxed text-[#ededed]">
                  {t("reset_password_invalid_body")}
                </p>

                <Link
                  href="/forgot-password"
                  className="mt-8 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-[#007eff] px-6 font-sans text-sm font-bold text-white transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  {t("reset_password_request_new_link")}
                </Link>
              </motion.div>
            ) : null}

            {viewState === "success" ? (
              <motion.div
                key="reset-password-success"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="text-center"
              >
                <SuccessCheckmark />
                <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {t("reset_password_success_title")}
                </h1>
                <p className="mt-3 font-serif text-base leading-relaxed text-[#ededed]">
                  {t("reset_password_success_body")}
                </p>
              </motion.div>
            ) : null}

            {viewState === "form" ? (
              <motion.div
                key="reset-password-form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              >
                <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {t("reset_password_title")}
                </h1>
                <p className="mt-3 font-serif text-base leading-relaxed text-[#ededed]">
                  {t("reset_password_subtitle")}
                </p>

                <form noValidate onSubmit={onSubmit} className="mt-8 space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="reset-password-new"
                      className="font-sans text-sm font-medium text-white"
                    >
                      {t("reset_password_new_password_label")}
                    </label>
                    <div className="relative">
                      <input
                        id="reset-password-new"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPassword(value);
                          if (touched.password) {
                            setErrors((current) => ({
                              ...current,
                              password: validatePassword(value) || undefined,
                            }));
                          }
                          if (touched.confirmPassword) {
                            setErrors((current) => ({
                              ...current,
                              confirmPassword:
                                validateConfirmPassword(confirmPassword, value) || undefined,
                            }));
                          }
                        }}
                        onBlur={() => {
                          setTouched((current) => ({ ...current, password: true }));
                          setErrors((current) => ({
                            ...current,
                            password: validatePassword(password) || undefined,
                          }));
                        }}
                        aria-label={t("reset_password_new_password_aria_label")}
                        aria-invalid={Boolean(passwordError)}
                        aria-describedby={passwordError ? "reset-password-new-error" : undefined}
                        placeholder={t("reset_password_new_password_placeholder")}
                        className={cn(
                          "min-h-12 w-full rounded-xl border bg-black px-4 pr-12 font-sans text-sm text-white placeholder:text-white/45 transition-[border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]/20",
                          passwordError
                            ? "border-[#EF4444] focus-visible:border-[#EF4444]"
                            : "border-[#2A2A2A] focus-visible:border-[#007eff]"
                        )}
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? t("reset_password_hide_password")
                            : t("reset_password_show_password")
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {passwordError ? (
                      <p
                        id="reset-password-new-error"
                        role="alert"
                        className="font-sans text-xs text-[#EF4444]"
                      >
                        {passwordError}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-sans text-xs text-white/65">
                        {t("signup_finish_password_strength")}
                      </p>
                      <p
                        className={cn(
                          "font-sans text-xs font-semibold",
                          passwordStrength.score >= 4
                            ? "text-emerald-300"
                            : passwordStrength.score >= 3
                              ? "text-[#9fd0ff]"
                              : passwordStrength.score >= 2
                                ? "text-amber-300"
                                : "text-[#ffb4b4]"
                        )}
                      >
                        {passwordStrengthText}
                      </p>
                    </div>
                    <div className="grid grid-cols-4 gap-1" aria-hidden="true">
                      {PASSWORD_STRENGTH_SEGMENT_KEYS.map((segmentKey, index) => (
                        <span
                          key={segmentKey}
                          className={cn(
                            "h-1.5 rounded-full",
                            index < passwordStrength.score
                              ? passwordStrength.score >= 4
                                ? "bg-emerald-400"
                                : passwordStrength.score >= 3
                                  ? "bg-[#007eff]"
                                  : passwordStrength.score >= 2
                                    ? "bg-amber-400"
                                    : "bg-[#ff6b6b]"
                              : "bg-white/10"
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="reset-password-confirm"
                      className="font-sans text-sm font-medium text-white"
                    >
                      {t("reset_password_confirm_password_label")}
                    </label>
                    <div className="relative">
                      <input
                        id="reset-password-confirm"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => {
                          const value = event.target.value;
                          setConfirmPassword(value);
                          if (touched.confirmPassword) {
                            setErrors((current) => ({
                              ...current,
                              confirmPassword:
                                validateConfirmPassword(value, password) || undefined,
                            }));
                          }
                        }}
                        onBlur={() => {
                          setTouched((current) => ({ ...current, confirmPassword: true }));
                          setErrors((current) => ({
                            ...current,
                            confirmPassword:
                              validateConfirmPassword(confirmPassword, password) || undefined,
                          }));
                        }}
                        aria-label={t("reset_password_confirm_password_aria_label")}
                        aria-invalid={Boolean(confirmPasswordError)}
                        aria-describedby={
                          confirmPasswordError ? "reset-password-confirm-error" : undefined
                        }
                        placeholder={t("reset_password_confirm_password_placeholder")}
                        className={cn(
                          "min-h-12 w-full rounded-xl border bg-black px-4 pr-12 font-sans text-sm text-white placeholder:text-white/45 transition-[border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]/20",
                          confirmPasswordError
                            ? "border-[#EF4444] focus-visible:border-[#EF4444]"
                            : "border-[#2A2A2A] focus-visible:border-[#007eff]"
                        )}
                      />
                      <button
                        type="button"
                        aria-label={
                          showConfirmPassword
                            ? t("reset_password_hide_confirm_password")
                            : t("reset_password_show_confirm_password")
                        }
                        aria-pressed={showConfirmPassword}
                        onClick={() => setShowConfirmPassword((current) => !current)}
                        className="absolute inset-y-0 right-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {confirmPasswordError ? (
                      <p
                        id="reset-password-confirm-error"
                        role="alert"
                        className="font-sans text-xs text-[#EF4444]"
                      >
                        {confirmPasswordError}
                      </p>
                    ) : null}
                  </div>

                  <p className="font-sans text-xs text-white/55">
                    {t("signup_finish_password_hint")}
                  </p>

                  {rateLimitMessage ? (
                    <p
                      id="reset-password-form-error"
                      role="alert"
                      className="rounded-xl border border-[#EF4444]/40 bg-[#220f12] px-4 py-3 font-sans text-sm text-[#ffb4bd]"
                    >
                      {rateLimitMessage}
                    </p>
                  ) : null}

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
                        {t("reset_password_submitting")}
                      </>
                    ) : (
                      t("reset_password_submit")
                    )}
                  </motion.button>
                </form>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.section>
      </div>
    </main>
  );
}

function ResetPasswordFallback() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] items-center px-4 py-8 sm:px-6 sm:py-12">
        <section className="w-full rounded-[28px] border border-[#2A2A2A] bg-[#050505] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.55)] sm:p-8">
          <p className="inline-flex items-center gap-2 font-sans text-sm text-white/70">
            <Loader2 className="size-4 animate-spin text-[#007eff]" aria-hidden="true" />
            Loading...
          </p>
        </section>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <RecaptchaProvider>
      <Suspense fallback={<ResetPasswordFallback />}>
        <ResetPasswordPageContent />
      </Suspense>
    </RecaptchaProvider>
  );
}
