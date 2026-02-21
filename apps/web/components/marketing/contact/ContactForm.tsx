"use client";

import { useMutation } from "@tanstack/react-query";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CheckCircle2Icon, Loader2Icon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { toast } from "sonner";
import { RecaptchaProvider } from "@/components/shared/RecaptchaProvider";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// Register GSAP plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Subject options mapped to Zod enum values
const SUBJECT_OPTIONS = [
  { value: "GENERAL_INQUIRY", labelKey: "form_subject_general" },
  { value: "CUSTOM_QUOTE", labelKey: "form_subject_quote" },
  { value: "PARTNERSHIP", labelKey: "form_subject_partnership" },
  { value: "SUPPORT", labelKey: "form_subject_support" },
  { value: "OTHER", labelKey: "form_subject_other" },
] as const;

// Field-level error state
interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  subjectOther?: string;
  message?: string;
}

// Shared CSS classes
const inputBase =
  "w-full rounded-lg border border-white/10 bg-white/5 px-4 pb-3 pt-6 font-sans text-sm text-primary-foreground placeholder-transparent transition-all duration-200 focus:border-accent/50 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-accent/20 md:text-base peer";

const labelBase =
  "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-xs font-semibold uppercase tracking-widest text-primary-foreground/25 transition-all duration-200 peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:text-accent/60 peer-[:not(:placeholder-shown)]:top-2.5 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[10px]";

const selectLabelBase =
  "pointer-events-none absolute left-4 font-display text-xs font-semibold uppercase tracking-widest text-primary-foreground/25 transition-all duration-200";

const errorBase = "mt-1 font-sans text-xs text-red-400";

// ── API mutation function ───────────────────────────────────────────────────
interface ContactPayload {
  name: string;
  email: string;
  phone: string;
  subject: string;
  subjectOther: string;
  message: string;
  recaptchaToken: string;
}

async function submitContact(payload: ContactPayload) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const response = await fetch(`${apiUrl}/v1/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || "Failed to send message");
  }

  return response.json();
}

/**
 * Inner form with reCAPTCHA hook (must be inside RecaptchaProvider)
 */
function ContactFormInner() {
  const t = useTranslations("contact");
  const { executeRecaptcha } = useGoogleReCaptcha();
  const prefersReduced = useReducedMotion();

  // ── Refs for GSAP ──
  const formRef = useRef<HTMLFormElement>(null);
  const fieldsRef = useRef<(HTMLDivElement | null)[]>([]);

  // ── Form state ──
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    subjectOther: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // ── TanStack Query mutation ──
  const mutation = useMutation({
    mutationFn: submitContact,
    onSuccess: () => {
      toast.success(t("form_success_title"), {
        description: t("form_success_desc"),
      });
    },
    onError: () => {
      toast.error(t("form_error_title"), {
        description: t("form_error_desc"),
      });
    },
  });

  // ── GSAP: Form field stagger reveal ──
  useEffect(() => {
    if (prefersReduced || !formRef.current) return;

    const fields = fieldsRef.current.filter(Boolean) as HTMLDivElement[];
    if (fields.length === 0) return;

    // Set initial state
    gsap.set(fields, { opacity: 0, x: -30 });

    const trigger = ScrollTrigger.create({
      trigger: formRef.current,
      start: "top 80%",
      once: true,
      onEnter: () => {
        gsap.to(fields, {
          opacity: 1,
          x: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: "power3.out",
        });
      },
    });

    return () => trigger.kill();
  }, [prefersReduced]);

  // ── Validation ──
  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errs.name = "Name must be at least 2 characters";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim() || !emailRegex.test(formData.email.trim())) {
      errs.email = "Please enter a valid email address";
    }

    if (!formData.subject) {
      errs.subject = "Please select a subject";
    }

    if (
      formData.subject === "OTHER" &&
      (!formData.subjectOther.trim() || formData.subjectOther.trim().length < 2)
    ) {
      errs.subjectOther = "Please specify your subject";
    }

    if (!formData.message.trim() || formData.message.trim().length < 10) {
      errs.message = "Message must be at least 10 characters";
    }

    return errs;
  }, [formData]);

  // ── Field blur validation ──
  const validateField = useCallback(
    (field: keyof FormErrors) => {
      const all = validate();
      setErrors((prev) => {
        const next = { ...prev };
        if (all[field]) {
          next[field] = all[field];
        } else {
          delete next[field];
        }
        return next;
      });
    },
    [validate]
  );

  // ── Submit ──
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const validationErrors = validate();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      // Execute reCAPTCHA v3
      let recaptchaToken = "dev-token";
      if (executeRecaptcha) {
        recaptchaToken = await executeRecaptcha("contact_form");
      }

      mutation.mutate({ ...formData, recaptchaToken });
    },
    [formData, validate, executeRecaptcha, mutation]
  );

  // ── Input change handler ──
  const handleChange = useCallback(
    (field: string) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value = e.target.value;
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error on change
        if (errors[field as keyof FormErrors]) {
          setErrors((prev) => {
            const next = { ...prev };
            delete next[field as keyof FormErrors];
            return next;
          });
        }
      },
    [errors]
  );

  // ── Ref collector for stagger animation ──
  const setFieldRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      fieldsRef.current[index] = el;
    },
    []
  );

  // ── Success state ──
  if (mutation.isSuccess) {
    return (
      <output
        aria-live="polite"
        className="flex flex-col items-center justify-center rounded-2xl border border-accent/20 bg-accent/5 px-8 py-16 text-center"
      >
        <CheckCircle2Icon className="size-16 text-accent" aria-hidden="true" />
        <h3 className="mt-6 font-display text-2xl font-bold text-primary-foreground md:text-3xl">
          {t("form_success_title")}
        </h3>
        <p className="mt-2 max-w-sm font-serif text-sm text-primary-foreground/50 md:text-base">
          {t("form_success_desc")}
        </p>
      </output>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Aria-live region for error announcements */}
      <div aria-live="assertive" className="sr-only">
        {mutation.isError && `${t("form_error_title")}: ${t("form_error_desc")}`}
      </div>

      {/* Name + Email — side by side on md+ */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Name — floating label */}
        <div ref={setFieldRef(0)}>
          <div className="relative">
            <input
              id="contact-name"
              type="text"
              autoComplete="name"
              value={formData.name}
              onChange={handleChange("name")}
              onBlur={() => validateField("name")}
              placeholder={t("form_name")}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "contact-name-error" : undefined}
              className={`${inputBase} ${errors.name ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/20" : ""}`}
            />
            <label htmlFor="contact-name" className={labelBase}>
              {t("form_name")}
            </label>
          </div>
          {errors.name && (
            <p id="contact-name-error" className={errorBase} role="alert">
              {errors.name}
            </p>
          )}
        </div>

        {/* Email — floating label */}
        <div ref={setFieldRef(1)}>
          <div className="relative">
            <input
              id="contact-email"
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange("email")}
              onBlur={() => validateField("email")}
              placeholder={t("form_email")}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "contact-email-error" : undefined}
              className={`${inputBase} ${errors.email ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/20" : ""}`}
            />
            <label htmlFor="contact-email" className={labelBase}>
              {t("form_email")}
            </label>
          </div>
          {errors.email && (
            <p id="contact-email-error" className={errorBase} role="alert">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      {/* Phone + Subject — side by side on md+ */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Phone (optional) — floating label */}
        <div ref={setFieldRef(2)}>
          <div className="relative">
            <input
              id="contact-phone"
              type="tel"
              autoComplete="tel"
              value={formData.phone}
              onChange={handleChange("phone")}
              placeholder={t("form_phone")}
              className={inputBase}
            />
            <label htmlFor="contact-phone" className={labelBase}>
              {t("form_phone")}{" "}
              <span className="font-normal normal-case tracking-normal text-primary-foreground/15">
                {t("form_phone_optional")}
              </span>
            </label>
          </div>
        </div>

        {/* Subject — positioned label (select can't use placeholder trick) */}
        <div ref={setFieldRef(3)}>
          <div className="relative">
            <select
              id="contact-subject"
              value={formData.subject}
              onChange={handleChange("subject")}
              onBlur={() => validateField("subject")}
              aria-invalid={!!errors.subject}
              aria-describedby={errors.subject ? "contact-subject-error" : undefined}
              className={`${inputBase} cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23777%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_16px_center] bg-no-repeat pr-10 placeholder-shown:text-primary-foreground/25 ${errors.subject ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/20" : ""}`}
            >
              <option value="" disabled className="bg-[#1a1a2e] text-white/50">
                {t("form_subject_placeholder")}
              </option>
              {SUBJECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#1a1a2e] text-white">
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
            <label
              htmlFor="contact-subject"
              className={`${selectLabelBase} ${formData.subject ? "top-2.5 text-[10px] text-accent/60" : "top-1/2 -translate-y-1/2"}`}
            >
              {t("form_subject")}
            </label>
          </div>
          {errors.subject && (
            <p id="contact-subject-error" className={errorBase} role="alert">
              {errors.subject}
            </p>
          )}
        </div>
      </div>

      {/* Subject Other — conditional */}
      {formData.subject === "OTHER" && (
        <div ref={setFieldRef(4)}>
          <div className="relative">
            <input
              id="contact-subject-other"
              type="text"
              value={formData.subjectOther}
              onChange={handleChange("subjectOther")}
              onBlur={() => validateField("subjectOther")}
              placeholder={t("form_subject_other_placeholder")}
              aria-invalid={!!errors.subjectOther}
              aria-describedby={errors.subjectOther ? "contact-subject-other-error" : undefined}
              className={`${inputBase} ${errors.subjectOther ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/20" : ""}`}
            />
            <label htmlFor="contact-subject-other" className={labelBase}>
              {t("form_subject_other_placeholder")}
            </label>
          </div>
          {errors.subjectOther && (
            <p id="contact-subject-other-error" className={errorBase} role="alert">
              {errors.subjectOther}
            </p>
          )}
        </div>
      )}

      {/* Message — floating label */}
      <div ref={setFieldRef(5)}>
        <div className="relative">
          <textarea
            id="contact-message"
            rows={5}
            value={formData.message}
            onChange={handleChange("message")}
            onBlur={() => validateField("message")}
            placeholder={t("form_message")}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "contact-message-error" : undefined}
            className={`${inputBase} resize-none pt-7 ${errors.message ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/20" : ""}`}
          />
          <label
            htmlFor="contact-message"
            className="pointer-events-none absolute left-4 top-4 font-display text-xs font-semibold uppercase tracking-widest text-primary-foreground/25 transition-all duration-200 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-accent/60 peer-[:not(:placeholder-shown)]:top-1.5 peer-[:not(:placeholder-shown)]:text-[10px]"
          >
            {t("form_message")}
          </label>
        </div>
        {errors.message && (
          <p id="contact-message-error" className={errorBase} role="alert">
            {errors.message}
          </p>
        )}
        <p className="mt-1 text-right font-sans text-xs text-primary-foreground/20">
          {formData.message.length} / 2000
        </p>
      </div>

      {/* reCAPTCHA notice */}
      <div ref={setFieldRef(6)}>
        <p className="font-sans text-xs leading-relaxed text-primary-foreground/20">
          {t.rich("recaptcha_notice", {
            privacy: (chunks) => (
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary-foreground/40"
              >
                {chunks}
              </a>
            ),
            terms: (chunks) => (
              <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary-foreground/40"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>

      {/* Submit button */}
      <div ref={setFieldRef(7)}>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="group inline-flex w-full items-center justify-center gap-2.5 rounded-lg bg-accent px-8 py-4 font-display text-sm font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:bg-accent/90 hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto md:text-base"
        >
          {mutation.isPending ? (
            <>
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              {t("form_sending")}
            </>
          ) : (
            <>
              {t("form_submit")}
              <SendIcon
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

/**
 * Public-facing contact form wrapped with reCAPTCHA provider.
 */
export function ContactForm() {
  return (
    <RecaptchaProvider>
      <ContactFormInner />
    </RecaptchaProvider>
  );
}
