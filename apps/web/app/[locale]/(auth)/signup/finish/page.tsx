"use client";

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MailCheck,
  ShieldAlert,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { VerificationCodeInput } from "@/components/shared/VerificationCodeInput";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type SignupStep = "password" | "verify" | "done";

type SignupContextResponse = {
  email: string;
  firstName: string;
  lastName: string | null;
  phoneNumber?: string | null;
  nextStep?: "password" | "verify";
};

const RESEND_COOLDOWN_SECONDS = 60;

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

async function extractError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (typeof payload?.message === "string" && payload.message.trim().length > 0) {
    return payload.message;
  }
  if (Array.isArray(payload?.message) && payload.message.length > 0) {
    return payload.message.join(", ");
  }
  return fallback;
}

function SignupFinishPageContent() {
  const t = useTranslations("auth");
  const checkoutT = useTranslations("checkout");
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [step, setStep] = useState<SignupStep>("password");
  const [context, setContext] = useState<SignupContextResponse | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const invalidTokenText = t("signup_finish_invalid_token");
  const prefillErrorText = t("signup_finish_prefill_error");

  useEffect(() => {
    if (!token) {
      setIsLoadingContext(false);
      setErrorMessage(invalidTokenText);
      return;
    }

    let isCancelled = false;
    const loadContext = async () => {
      setIsLoadingContext(true);
      setErrorMessage("");
      try {
        const response = await fetch(`${getApiV1BaseUrl()}/auth/signup/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          const message = await extractError(response, prefillErrorText);
          if (!isCancelled) setErrorMessage(message);
          return;
        }

        const payload = (await response.json()) as SignupContextResponse;
        if (!isCancelled) {
          setContext(payload);
          const isVerifyStep = payload.nextStep === "verify";
          setStep(isVerifyStep ? "verify" : "password");
          setResendCooldown(isVerifyStep ? RESEND_COOLDOWN_SECONDS : 0);
        }
      } catch {
        if (!isCancelled) setErrorMessage(prefillErrorText);
      } finally {
        if (!isCancelled) setIsLoadingContext(false);
      }
    };

    void loadContext();

    return () => {
      isCancelled = true;
    };
  }, [invalidTokenText, prefillErrorText, token]);

  const fullName = useMemo(() => {
    if (!context) return "";
    return `${context.firstName} ${context.lastName ?? ""}`.trim();
  }, [context]);

  const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
  const canSubmitPassword =
    !isLoadingContext &&
    !isSubmittingPassword &&
    Boolean(token) &&
    Boolean(context?.email) &&
    password.trim().length > 0 &&
    confirmPassword.trim().length > 0;
  const canSubmitCode =
    !isSubmittingCode &&
    Boolean(context?.email) &&
    normalizedCode.length === 6 &&
    step === "verify";
  const canResend =
    !isResending && Boolean(context?.email) && step === "verify" && resendCooldown === 0;
  const stepProgress = step === "password" ? 1 : step === "verify" ? 2 : 3;
  const showPasswordText = t("signup_finish_show_password");
  const hidePasswordText = t("signup_finish_hide_password");
  const showConfirmPasswordText = t("signup_finish_show_confirm_password");
  const hideConfirmPasswordText = t("signup_finish_hide_confirm_password");
  const resendCooldownText = t("signup_finish_resend_wait", { seconds: resendCooldown });

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitPassword || !token) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsSubmittingPassword(true);
    try {
      const response = await fetch(`${getApiV1BaseUrl()}/auth/signup/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      if (!response.ok) {
        const message = await extractError(response, t("signup_finish_password_error"));
        setErrorMessage(message);
        return;
      }

      setStep("verify");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStatusMessage(t("signup_finish_code_sent"));
    } catch {
      setErrorMessage(t("signup_finish_password_error"));
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const verifyCode = async (rawCode: string) => {
    const resolvedCode = rawCode.replace(/\D/g, "").slice(0, 6);
    if (!context?.email || resolvedCode.length !== 6 || isSubmittingCode || step !== "verify") {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsSubmittingCode(true);
    try {
      const response = await fetch(`${getApiV1BaseUrl()}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: context.email,
          code: resolvedCode,
        }),
      });

      if (!response.ok) {
        const message = await extractError(response, t("signup_finish_verify_error"));
        setErrorMessage(message);
        return;
      }

      setStep("done");
      setStatusMessage(t("signup_finish_verified_subtitle"));
      router.replace("/signup/finish/confirmation");
    } catch {
      setErrorMessage(t("signup_finish_verify_error"));
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await verifyCode(code);
  };

  const verifyCodeOnComplete = (completedCode: string) => {
    if (isSubmittingCode || step !== "verify" || !context?.email) return;
    const resolvedCode = completedCode.replace(/\D/g, "").slice(0, 6);
    if (resolvedCode.length !== 6) return;
    void verifyCode(resolvedCode);
  };

  const resendSignupLink = async () => {
    if (!canResend || !context?.email) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsResending(true);
    try {
      const response = await fetch(`${getApiV1BaseUrl()}/auth/resend-signup-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: context.email }),
      });

      if (!response.ok) {
        const message = await extractError(response, t("signup_finish_resend_error"));
        setErrorMessage(message);
        return;
      }

      setStatusMessage(t("signup_finish_resend_success"));
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setErrorMessage(t("signup_finish_resend_error"));
    } finally {
      setIsResending(false);
    }
  };

  const showFatalState = !token || (!isLoadingContext && !context);

  return (
    <main className="relative min-h-screen overflow-hidden bg-primary text-primary-foreground">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-90"
        aria-hidden="true"
        style={{
          background: "radial-gradient(80% 60% at 50% 0%, rgba(0,126,255,0.16), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 opacity-80 blur-3xl"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, rgba(0,126,255,0.14), transparent 70%)" }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-20 md:px-6 md:pb-14 md:pt-24 lg:px-8 lg:pb-16 lg:pt-28">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-6">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-40"
              aria-hidden="true"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,126,255,0.14) 0%, rgba(0,126,255,0) 100%)",
              }}
            />
            <div className="relative">
              <p className="inline-flex rounded-full border border-[#007eff]/40 bg-[#007eff]/10 px-3 py-1 font-sans text-[11px] font-medium tracking-[0.08em] text-[#9fd0ff] uppercase">
                {t("signup")}
              </p>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-primary-foreground md:text-4xl">
                {t("signup_finish_title")}
              </h1>
              <p className="mt-3 max-w-xl font-serif text-base leading-relaxed text-primary-foreground/65">
                {step === "verify"
                  ? t("signup_finish_verify_subtitle")
                  : t("signup_finish_subtitle")}
              </p>

              <div className="mt-8 grid grid-cols-3 gap-2">
                {[
                  { id: 1, icon: LockKeyhole, label: t("signup_finish_continue") },
                  { id: 2, icon: MailCheck, label: t("signup_finish_verify_button") },
                  { id: 3, icon: CheckCircle2, label: t("signup_finish_verified_title") },
                ].map(({ id, icon: Icon, label }) => {
                  const isActive = stepProgress === id;
                  const isComplete = stepProgress > id;

                  return (
                    <div
                      key={label}
                      className={cn(
                        "rounded-2xl border px-3 py-3",
                        isComplete
                          ? "border-[#007eff]/50 bg-[#007eff]/14"
                          : isActive
                            ? "border-[#007eff]/60 bg-[#007eff]/10 shadow-[0_0_24px_rgba(0,126,255,0.16)]"
                            : "border-white/10 bg-black/30"
                      )}
                    >
                      <div
                        className={cn(
                          "inline-flex size-8 items-center justify-center rounded-full border",
                          isComplete || isActive
                            ? "border-[#007eff]/50 bg-[#007eff]/20 text-[#9fd0ff]"
                            : "border-white/20 bg-black text-white/65"
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </div>
                      <p className="mt-3 font-sans text-[11px] font-medium leading-snug text-white/75">
                        {label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)] md:p-8">
            <div className="flex items-center justify-end">
              <Link
                href="/pricing"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-black px-4 font-sans text-xs font-semibold tracking-[0.06em] text-white/80 uppercase transition-colors duration-150 hover:border-[#007eff]"
              >
                {checkoutT("addons_back_to_pricing")}
              </Link>
            </div>

            {isLoadingContext ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black px-4 py-4">
                <p className="inline-flex items-center gap-2 font-sans text-sm text-white/70">
                  <Loader2 className="size-4 animate-spin text-[#007eff]" aria-hidden="true" />
                  {t("signup_finish_loading")}
                </p>
              </div>
            ) : null}

            {showFatalState ? (
              <div className="mt-6 rounded-2xl border border-[#7a1f1f] bg-[#180d0d] px-4 py-4">
                <p className="inline-flex items-center gap-2 font-sans text-sm text-[#ffb4b4]">
                  <ShieldAlert className="size-4" aria-hidden="true" />
                  {errorMessage || invalidTokenText}
                </p>
              </div>
            ) : null}

            {!showFatalState && step === "password" ? (
              <form onSubmit={submitPassword} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="signup-finish-full-name"
                    className="font-sans text-xs font-medium tracking-[0.08em] text-white/55 uppercase"
                  >
                    {t("signup_finish_full_name")}
                  </label>
                  <input
                    id="signup-finish-full-name"
                    type="text"
                    value={fullName}
                    readOnly
                    aria-readonly="true"
                    className="min-h-11 w-full rounded-xl border border-white/10 bg-[#111111] px-4 font-sans text-sm text-white/70"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="signup-finish-email"
                    className="font-sans text-xs font-medium tracking-[0.08em] text-white/55 uppercase"
                  >
                    {t("signup_finish_email")}
                  </label>
                  <input
                    id="signup-finish-email"
                    type="email"
                    value={context?.email ?? ""}
                    readOnly
                    aria-readonly="true"
                    className="min-h-11 w-full rounded-xl border border-white/10 bg-[#111111] px-4 font-sans text-sm text-white/70"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="signup-finish-phone"
                    className="font-sans text-xs font-medium tracking-[0.08em] text-white/55 uppercase"
                  >
                    {t("signup_finish_phone")}
                  </label>
                  <input
                    id="signup-finish-phone"
                    type="tel"
                    value={context?.phoneNumber ?? ""}
                    readOnly
                    aria-readonly="true"
                    className="min-h-11 w-full rounded-xl border border-white/10 bg-[#111111] px-4 font-sans text-sm text-white/70"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="signup-finish-password"
                    className="font-sans text-xs font-medium tracking-[0.08em] text-white/55 uppercase"
                  >
                    {t("signup_finish_password")}
                  </label>
                  <div className="relative">
                    <input
                      id="signup-finish-password"
                      type={isPasswordVisible ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-black px-4 pr-12 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                    />
                    <button
                      type="button"
                      onClick={() => setIsPasswordVisible((current) => !current)}
                      aria-label={isPasswordVisible ? hidePasswordText : showPasswordText}
                      aria-pressed={isPasswordVisible}
                      className="absolute top-1/2 right-1 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                    >
                      {isPasswordVisible ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="signup-finish-confirm-password"
                    className="font-sans text-xs font-medium tracking-[0.08em] text-white/55 uppercase"
                  >
                    {t("signup_finish_confirm_password")}
                  </label>
                  <div className="relative">
                    <input
                      id="signup-finish-confirm-password"
                      type={isConfirmPasswordVisible ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-black px-4 pr-12 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                    />
                    <button
                      type="button"
                      onClick={() => setIsConfirmPasswordVisible((current) => !current)}
                      aria-label={
                        isConfirmPasswordVisible ? hideConfirmPasswordText : showConfirmPasswordText
                      }
                      aria-pressed={isConfirmPasswordVisible}
                      className="absolute top-1/2 right-1 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                    >
                      {isConfirmPasswordVisible ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <p className="font-sans text-xs text-white/55">
                  {t("signup_finish_password_hint")}
                </p>

                <button
                  type="submit"
                  disabled={!canSubmitPassword}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full px-5 font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    canSubmitPassword
                      ? "bg-[#007eff] text-white shadow-[0_10px_28px_rgba(0,126,255,0.3)] hover:brightness-110"
                      : "cursor-not-allowed border border-white/10 bg-[#121212] text-white/45"
                  )}
                >
                  {isSubmittingPassword ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      {t("signup_finish_processing")}
                    </>
                  ) : (
                    t("signup_finish_continue")
                  )}
                </button>
              </form>
            ) : null}

            {!showFatalState && step === "verify" ? (
              <form onSubmit={submitCode} className="mt-6 space-y-4">
                <VerificationCodeInput
                  id="signup-finish-code"
                  label={t("signup_finish_code_label")}
                  value={normalizedCode}
                  onChange={setCode}
                  onComplete={verifyCodeOnComplete}
                  disabled={isSubmittingCode}
                  required
                  align="center"
                />

                <button
                  type="submit"
                  disabled={!canSubmitCode}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full px-5 font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    canSubmitCode
                      ? "bg-[#007eff] text-white shadow-[0_10px_28px_rgba(0,126,255,0.3)] hover:brightness-110"
                      : "cursor-not-allowed border border-white/10 bg-[#121212] text-white/45"
                  )}
                >
                  {isSubmittingCode ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      {t("signup_finish_verifying")}
                    </>
                  ) : (
                    t("signup_finish_verify_button")
                  )}
                </button>

                <button
                  type="button"
                  onClick={resendSignupLink}
                  disabled={!canResend}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full border px-5 font-sans text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    canResend
                      ? "border-white/15 bg-black text-white hover:border-[#007eff]"
                      : "cursor-not-allowed border-white/10 bg-[#121212] text-white/45"
                  )}
                >
                  {isResending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      {t("signup_finish_resend_sending")}
                    </>
                  ) : resendCooldown > 0 ? (
                    resendCooldownText
                  ) : (
                    t("signup_finish_resend_button")
                  )}
                </button>
              </form>
            ) : null}

            {step === "done" ? (
              <div className="mt-6 rounded-2xl border border-[#1d4f29] bg-[#0d1a12] px-4 py-4">
                <p className="inline-flex items-center gap-2 font-sans text-sm text-[#b7f6c8]">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {t("signup_finish_verified_title")}
                </p>
                <p className="mt-2 font-sans text-sm text-[#b7f6c8]/80">
                  {t("signup_finish_verified_subtitle")}
                </p>
              </div>
            ) : null}

            {errorMessage && !showFatalState ? (
              <div className="mt-4 rounded-2xl border border-[#7a1f1f] bg-[#180d0d] px-4 py-3">
                <p className="font-sans text-sm text-[#ffb4b4]">{errorMessage}</p>
              </div>
            ) : null}
            {statusMessage ? (
              <div className="mt-3 rounded-2xl border border-[#007eff]/30 bg-[#007eff]/10 px-4 py-3">
                <p className="font-sans text-sm text-[#9fd0ff]">{statusMessage}</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function SignupFinishFallback() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-primary text-primary-foreground">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-90"
        aria-hidden="true"
        style={{
          background: "radial-gradient(80% 60% at 50% 0%, rgba(0,126,255,0.16), transparent)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-20 md:px-6 md:pb-14 md:pt-24 lg:px-8 lg:pb-16 lg:pt-28">
        <div className="rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 md:p-8">
          <p className="inline-flex items-center gap-2 font-sans text-sm text-white/70">
            <Loader2 className="size-4 animate-spin text-[#007eff]" aria-hidden="true" />
            Loading...
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SignupFinishPage() {
  return (
    <Suspense fallback={<SignupFinishFallback />}>
      <SignupFinishPageContent />
    </Suspense>
  );
}
