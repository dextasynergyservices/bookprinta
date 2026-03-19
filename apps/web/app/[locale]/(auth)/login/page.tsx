"use client";

import { type AuthSessionResponse, UserRoleSchema, type UserRoleValue } from "@bookprinta/shared";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { toast } from "sonner";
import { RecaptchaProvider } from "@/components/shared/RecaptchaProvider";
import { AUTH_SESSION_QUERY_KEY, useAuthSession } from "@/hooks/use-auth-session";
import {
  resolvePostLoginRedirect,
  stripLoginRedirectQueryParams,
} from "@/lib/auth/redirect-policy";
import { getPathname, Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const RATE_LIMIT_FALLBACK_SECONDS = 180;
const LOGIN_ADMIN_TO_USER_RETURN_POLICY = "fallback" as const;

type LoginResponse = AuthSessionResponse;

type LoginErrorResponse = {
  message?: string | string[];
  errorCode?: string;
  retryAfterSeconds?: number;
  resendEmail?: string;
};

type FormErrors = {
  identifier?: string;
  password?: string;
};

type LoginTimingSample = {
  event: "auth.login.timing.client";
  correlationId: string;
  recaptchaDurationMs: number | null;
  requestDurationMs: number | null;
  totalDurationMs: number | null;
  outcome: "success" | "failure";
  httpStatus: number | null;
  errorCode: string | null;
  serverCorrelationId: string | null;
};

function createCorrelationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function markTiming(name: string) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  performance.mark(name);
}

function measureTiming(name: string, startMark: string, endMark: string): number | null {
  if (
    typeof performance === "undefined" ||
    typeof performance.measure !== "function" ||
    typeof performance.getEntriesByName !== "function"
  ) {
    return null;
  }

  performance.measure(name, startMark, endMark);
  const entry = performance.getEntriesByName(name).at(-1);
  performance.clearMarks(startMark);
  performance.clearMarks(endMark);
  performance.clearMeasures(name);

  return entry ? Math.round(entry.duration) : null;
}

function logLoginTiming(sample: LoginTimingSample) {
  console.info("[auth-timing]", sample);
}

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function isEmailIdentifier(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhoneIdentifier(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isValidIdentifier(value: string) {
  return isEmailIdentifier(value) || isPhoneIdentifier(value);
}

function resolveRetryAfterSeconds(response: Response, payload: LoginErrorResponse | null) {
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

function normalizeUserRole(role: unknown): UserRoleValue | undefined {
  const parsed = UserRoleSchema.safeParse(role);
  return parsed.success ? parsed.data : undefined;
}

function LoginPageInner() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading, isFetching } = useAuthSession();
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ identifier: false, password: false });
  const [errors, setErrors] = useState<FormErrors>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingLink, setIsResendingLink] = useState(false);
  const [formError, setFormError] = useState("");
  const [isUnverifiedError, setIsUnverifiedError] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [resendStatus, setResendStatus] = useState("");
  const [resendEmail, setResendEmail] = useState("");

  const normalizedIdentifier = useMemo(() => {
    const trimmed = identifier.trim();
    return isEmailIdentifier(trimmed) ? trimmed.toLowerCase() : trimmed;
  }, [identifier]);
  const resetStatus = searchParams.get("reset");
  const returnTo = searchParams.get("returnTo") ?? searchParams.get("next");
  const canSubmit = !isSubmitting;
  const canResendLink = isUnverifiedError && Boolean(resendEmail) && !isResendingLink;

  const navigateAfterLogin = useCallback(
    (role: UserRoleValue | null | undefined) => {
      const href = resolvePostLoginRedirect({
        role,
        returnTo,
        adminToUserPolicy: LOGIN_ADMIN_TO_USER_RETURN_POLICY,
      });
      const target = getPathname({ href, locale });

      if (typeof window !== "undefined") {
        const cleanedSearch = stripLoginRedirectQueryParams(window.location.search);
        const cleanedLoginUrl = `${window.location.pathname}${cleanedSearch}${window.location.hash}`;
        window.history.replaceState(window.history.state, "", cleanedLoginUrl);
      }

      // Use a single hard redirect after login so the protected route boots with
      // the freshly issued HttpOnly cookies instead of depending on client-router
      // state or a stale in-flight session query.
      if (typeof window !== "undefined") {
        if (process.env.NODE_ENV === "test") {
          router.replace(target);
          return;
        }

        window.location.replace(target);
        return;
      }

      router.replace(target);
    },
    [locale, returnTo, router]
  );

  const validateIdentifier = (value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) return t("login_validation_email_required");
    if (!isValidIdentifier(normalizedValue)) return t("login_validation_email_invalid");
    return "";
  };

  const validatePassword = (value: string) => {
    if (!value.trim()) return t("login_validation_password_required");
    if (value.trim().length < 8) return t("login_validation_password_min");
    return "";
  };

  const validateForm = () => {
    const nextErrors: FormErrors = {};
    const identifierError = validateIdentifier(identifier);
    const passwordError = validatePassword(password);

    if (identifierError) nextErrors.identifier = identifierError;
    if (passwordError) nextErrors.password = passwordError;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  useEffect(() => {
    if (resetStatus !== "success") return;
    toast.success(t("reset_password_login_success_toast"));
    router.replace(pathname);
  }, [pathname, resetStatus, router, t]);

  useEffect(() => {
    if (isLoading || isFetching || !isAuthenticated || !user?.role || isSubmitting) return;

    const normalizedRole = normalizeUserRole(user.role);
    navigateAfterLogin(normalizedRole);
  }, [isAuthenticated, isFetching, isLoading, isSubmitting, navigateAfterLogin, user?.role]);

  useEffect(() => {
    if (rateLimitSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRateLimitSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [rateLimitSeconds]);

  const onIdentifierBlur = () => {
    setTouched((current) => ({ ...current, identifier: true }));
    setErrors((current) => ({
      ...current,
      identifier: validateIdentifier(identifier) || undefined,
    }));
  };

  const onPasswordBlur = () => {
    setTouched((current) => ({ ...current, password: true }));
    setErrors((current) => ({
      ...current,
      password: validatePassword(password) || undefined,
    }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTouched({ identifier: true, password: true });
    setResendStatus("");
    setFormError("");
    setIsUnverifiedError(false);
    setRateLimitSeconds(0);
    setResendEmail("");

    if (!validateForm()) return;

    setIsSubmitting(true);
    const correlationId = createCorrelationId();
    const totalStartMark = `auth-login:${correlationId}:total:start`;
    const totalEndMark = `auth-login:${correlationId}:total:end`;
    const recaptchaStartMark = `auth-login:${correlationId}:recaptcha:start`;
    const recaptchaEndMark = `auth-login:${correlationId}:recaptcha:end`;
    const requestStartMark = `auth-login:${correlationId}:request:start`;
    const requestEndMark = `auth-login:${correlationId}:request:end`;
    markTiming(totalStartMark);

    let recaptchaDurationMs: number | null = null;
    let requestDurationMs: number | null = null;
    let totalDurationMs: number | null = null;
    let serverCorrelationId: string | null = null;
    try {
      let recaptchaToken = "dev-token";
      if (executeRecaptcha) {
        markTiming(recaptchaStartMark);
        recaptchaToken = await executeRecaptcha("login_form");
        markTiming(recaptchaEndMark);
        recaptchaDurationMs = measureTiming(
          `auth-login:${correlationId}:recaptcha`,
          recaptchaStartMark,
          recaptchaEndMark
        );
      }

      markTiming(requestStartMark);
      const response = await fetch(`${getApiV1BaseUrl()}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": correlationId,
          ...(typeof recaptchaDurationMs === "number"
            ? { "x-client-recaptcha-duration-ms": String(recaptchaDurationMs) }
            : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          password,
          recaptchaToken,
        }),
      });
      markTiming(requestEndMark);
      requestDurationMs = measureTiming(
        `auth-login:${correlationId}:request`,
        requestStartMark,
        requestEndMark
      );
      serverCorrelationId = response.headers.get("x-request-id");

      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as LoginResponse | null;
        const role = normalizeUserRole(payload?.user?.role);
        await queryClient.cancelQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
        if (payload?.user) {
          queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, payload.user);
        } else {
          queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
        }

        toast.success(t("login_success_toast"));
        markTiming(totalEndMark);
        totalDurationMs = measureTiming(
          `auth-login:${correlationId}:total`,
          totalStartMark,
          totalEndMark
        );
        logLoginTiming({
          event: "auth.login.timing.client",
          correlationId,
          recaptchaDurationMs,
          requestDurationMs,
          totalDurationMs,
          outcome: "success",
          httpStatus: response.status,
          errorCode: null,
          serverCorrelationId,
        });
        navigateAfterLogin(role);
        return;
      }

      const payload = (await response.json().catch(() => null)) as LoginErrorResponse | null;
      const errorCode = payload?.errorCode;

      if (response.status === 429 || errorCode === "AUTH_LOGIN_RATE_LIMIT") {
        const retrySeconds = resolveRetryAfterSeconds(response, payload);
        setRateLimitSeconds(retrySeconds);
        markTiming(totalEndMark);
        totalDurationMs = measureTiming(
          `auth-login:${correlationId}:total`,
          totalStartMark,
          totalEndMark
        );
        logLoginTiming({
          event: "auth.login.timing.client",
          correlationId,
          recaptchaDurationMs,
          requestDurationMs,
          totalDurationMs,
          outcome: "failure",
          httpStatus: response.status,
          errorCode: errorCode ?? "AUTH_LOGIN_RATE_LIMIT",
          serverCorrelationId,
        });
        return;
      }

      if (errorCode === "AUTH_UNVERIFIED_ACCOUNT") {
        const fallbackResendEmail = isEmailIdentifier(normalizedIdentifier)
          ? normalizedIdentifier.toLowerCase()
          : "";
        setIsUnverifiedError(true);
        setResendEmail(payload?.resendEmail?.trim().toLowerCase() || fallbackResendEmail);
        setFormError(t("login_error_unverified"));
        markTiming(totalEndMark);
        totalDurationMs = measureTiming(
          `auth-login:${correlationId}:total`,
          totalStartMark,
          totalEndMark
        );
        logLoginTiming({
          event: "auth.login.timing.client",
          correlationId,
          recaptchaDurationMs,
          requestDurationMs,
          totalDurationMs,
          outcome: "failure",
          httpStatus: response.status,
          errorCode,
          serverCorrelationId,
        });
        return;
      }

      if (errorCode === "AUTH_RECAPTCHA_FAILED") {
        setFormError(t("login_error_recaptcha"));
        markTiming(totalEndMark);
        totalDurationMs = measureTiming(
          `auth-login:${correlationId}:total`,
          totalStartMark,
          totalEndMark
        );
        logLoginTiming({
          event: "auth.login.timing.client",
          correlationId,
          recaptchaDurationMs,
          requestDurationMs,
          totalDurationMs,
          outcome: "failure",
          httpStatus: response.status,
          errorCode,
          serverCorrelationId,
        });
        return;
      }

      setFormError(t("login_error_invalid_credentials"));
      markTiming(totalEndMark);
      totalDurationMs = measureTiming(
        `auth-login:${correlationId}:total`,
        totalStartMark,
        totalEndMark
      );
      logLoginTiming({
        event: "auth.login.timing.client",
        correlationId,
        recaptchaDurationMs,
        requestDurationMs,
        totalDurationMs,
        outcome: "failure",
        httpStatus: response.status,
        errorCode: errorCode ?? null,
        serverCorrelationId,
      });
    } catch {
      setFormError(t("login_error_generic"));
      if (requestDurationMs === null) {
        markTiming(requestEndMark);
        requestDurationMs = measureTiming(
          `auth-login:${correlationId}:request`,
          requestStartMark,
          requestEndMark
        );
      }
      markTiming(totalEndMark);
      totalDurationMs = measureTiming(
        `auth-login:${correlationId}:total`,
        totalStartMark,
        totalEndMark
      );
      logLoginTiming({
        event: "auth.login.timing.client",
        correlationId,
        recaptchaDurationMs,
        requestDurationMs,
        totalDurationMs,
        outcome: "failure",
        httpStatus: null,
        errorCode: "NETWORK_ERROR",
        serverCorrelationId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendSignupLink = async () => {
    if (!canResendLink) return;

    setResendStatus("");
    setIsResendingLink(true);
    try {
      const response = await fetch(`${getApiV1BaseUrl()}/auth/resend-signup-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: resendEmail }),
      });

      if (!response.ok) {
        setResendStatus(t("login_resend_error"));
        return;
      }

      setResendStatus(t("login_resend_success"));
    } catch {
      setResendStatus(t("login_resend_error"));
    } finally {
      setIsResendingLink(false);
    }
  };

  const rateLimitMessage =
    rateLimitSeconds > 0
      ? t("login_error_rate_limit_countdown", { seconds: rateLimitSeconds })
      : t("login_error_rate_limit");

  const identifierError = touched.identifier ? errors.identifier : undefined;
  const passwordError = touched.password ? errors.password : undefined;

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
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {t("login_title")}
          </h1>
          <p className="mt-3 font-serif text-base leading-relaxed text-[#ededed]">
            {t("login_subtitle")}
          </p>

          <form noValidate onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="login-identifier"
                className="font-sans text-sm font-medium text-white"
              >
                {t("login_email_label")}
              </label>
              <input
                id="login-identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => {
                  const value = event.target.value;
                  setIdentifier(value);
                  if (touched.identifier) {
                    setErrors((current) => ({
                      ...current,
                      identifier: validateIdentifier(value) || undefined,
                    }));
                  }
                }}
                onBlur={onIdentifierBlur}
                aria-label={t("login_email_aria_label")}
                aria-invalid={Boolean(identifierError)}
                aria-describedby={identifierError ? "login-identifier-error" : undefined}
                placeholder={t("login_email_placeholder")}
                className={cn(
                  "min-h-12 w-full rounded-xl border bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 transition-[border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]/20",
                  identifierError
                    ? "border-[#EF4444] focus-visible:border-[#EF4444]"
                    : "border-[#2A2A2A] focus-visible:border-[#007eff]"
                )}
              />
              {identifierError ? (
                <p
                  id="login-identifier-error"
                  role="alert"
                  className="font-sans text-xs text-[#EF4444]"
                >
                  {identifierError}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="font-sans text-sm font-medium text-white">
                {t("login_password_label")}
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
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
                  }}
                  onBlur={onPasswordBlur}
                  aria-label={t("login_password_aria_label")}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? "login-password-error" : undefined}
                  placeholder={t("login_password_placeholder")}
                  className={cn(
                    "min-h-12 w-full rounded-xl border bg-black px-4 pr-12 font-sans text-sm text-white placeholder:text-white/35 transition-[border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]/20",
                    passwordError
                      ? "border-[#EF4444] focus-visible:border-[#EF4444]"
                      : "border-[#2A2A2A] focus-visible:border-[#007eff]"
                  )}
                />
                <button
                  type="button"
                  aria-label={showPassword ? t("login_hide_password") : t("login_show_password")}
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
                  id="login-password-error"
                  role="alert"
                  className="font-sans text-xs text-[#EF4444]"
                >
                  {passwordError}
                </p>
              ) : null}

              <Link
                href="/forgot-password"
                className="inline-flex font-sans text-xs font-medium text-[#007eff] transition-colors duration-150 hover:text-[#4da2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
              >
                {t("forgot_password")}
              </Link>
            </div>

            {rateLimitSeconds > 0 ? (
              <p
                id="login-form-error"
                role="alert"
                className="rounded-xl border border-[#EF4444]/40 bg-[#220f12] px-4 py-3 font-sans text-sm text-[#ffb4bd]"
              >
                {rateLimitMessage}
              </p>
            ) : null}

            {formError ? (
              <div
                className="rounded-xl border border-[#EF4444]/40 bg-[#220f12] px-4 py-3"
                aria-live="assertive"
              >
                <p id="login-form-error" role="alert" className="font-sans text-sm text-[#ffb4bd]">
                  {formError}
                </p>
                {isUnverifiedError ? (
                  <button
                    type="button"
                    disabled={!canResendLink}
                    onClick={resendSignupLink}
                    className={cn(
                      "mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 font-sans text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]",
                      canResendLink
                        ? "border-[#007eff] text-[#007eff] hover:bg-[#007eff]/10"
                        : "cursor-not-allowed border-[#2A2A2A] text-white/45"
                    )}
                  >
                    {isResendingLink ? t("login_resend_sending") : t("login_resend_button")}
                  </button>
                ) : null}
                {resendStatus ? (
                  <p className="mt-2 font-sans text-xs text-white/80" aria-live="polite">
                    {resendStatus}
                  </p>
                ) : null}
              </div>
            ) : null}

            <motion.button
              type="submit"
              disabled={!canSubmit}
              whileHover={canSubmit ? { scale: 1.015 } : undefined}
              whileTap={canSubmit ? { scale: 0.985 } : undefined}
              className={cn(
                "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-bold text-white transition-[opacity,filter] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                canSubmit ? "hover:brightness-110" : "cursor-not-allowed opacity-60"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  {t("login_submitting")}
                </>
              ) : (
                t("login")
              )}
            </motion.button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-2 font-sans text-xs text-white/55">
            <Link
              href="/terms"
              className="rounded-sm px-1 text-white/60 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
            >
              {t("login_footer_terms")}
            </Link>
            <span aria-hidden="true" className="text-white/25">
              /
            </span>
            <Link
              href="/privacy"
              className="rounded-sm px-1 text-white/60 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
            >
              {t("login_footer_privacy")}
            </Link>
            <span aria-hidden="true" className="text-white/25">
              /
            </span>
            <Link
              href="/pricing"
              className="rounded-sm px-1 text-[#007eff] transition-colors duration-150 hover:text-[#4da2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
            >
              {t("login_footer_signup")}
            </Link>
          </div>
        </motion.section>
      </div>
    </main>
  );
}

function LoginPageFallback() {
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

export default function LoginPage() {
  return (
    <RecaptchaProvider>
      <Suspense fallback={<LoginPageFallback />}>
        <LoginPageInner />
      </Suspense>
    </RecaptchaProvider>
  );
}
