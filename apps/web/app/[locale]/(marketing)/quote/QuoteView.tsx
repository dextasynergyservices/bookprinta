"use client";

import { AnimatePresence, animate, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Fragment,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { z } from "zod";
import { ScrollProgress } from "@/components/marketing/showcase/ScrollProgress";
import { RecaptchaProvider } from "@/components/shared/RecaptchaProvider";
import { useLenis } from "@/hooks/use-lenis";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { trackQuoteSubmitted } from "@/lib/analytics/posthog-events";
import { RateLimitError, throwApiError, toRetryAfterMinutes } from "@/lib/api-error";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type QuoteBookSize = "A4" | "A5" | "A6";
type BookSize = "" | QuoteBookSize;
type SpecialRequirementKey =
  | "hard_back"
  | "embossing"
  | "gold_foil"
  | "special_size"
  | "full_color"
  | "paper_stock"
  | "other";

interface QuoteShellState {
  workingTitle: string;
  estimatedWordCount: string;
  bookSize: BookSize;
  quantity: string;
  hasSpecialRequirements: boolean;
  specialRequirements: Record<SpecialRequirementKey, boolean>;
  specialRequirementsOther: string;
  fullName: string;
  email: string;
  phone: string;
}
type StepField =
  | "workingTitle"
  | "estimatedWordCount"
  | "bookSize"
  | "quantity"
  | "fullName"
  | "email"
  | "phone";
type FieldErrors = Partial<Record<StepField, string>>;
type FieldTouched = Record<StepField, boolean>;
type QuoteSpecialRequirementPayload =
  | "hardback"
  | "embossing"
  | "gold_foil"
  | "special_size"
  | "full_color_interior"
  | "special_paper"
  | "other";
type QuoteEstimatorState = {
  status: "idle" | "loading" | "ready" | "error";
  requestKey: string | null;
  estimatedPriceLow: number | null;
  estimatedPriceHigh: number | null;
  errorMessage: string | null;
};
type EstimateLoadingStage = "calculating" | "finalizing";

interface QuoteEstimateResponse {
  estimatedPriceLow: number;
  estimatedPriceHigh: number;
}

interface SubmittedQuoteSummary {
  firstName: string;
  workingTitle: string;
  bookSize: QuoteBookSize;
  quantity: number;
  hasSpecialReqs: boolean;
  estimatedPriceLow: number | null;
  estimatedPriceHigh: number | null;
}

const BOOK_SIZES = ["A4", "A5", "A6"] as const;
const STEP_COUNT = 4;
const ESTIMATE_LOADING_MIN_DURATION_MS = 2800;
const ESTIMATE_LOADING_STAGE_FINALIZING_MS = 1800;
const SPECIAL_REQUIREMENT_OPTIONS: Array<{
  key: SpecialRequirementKey;
  labelKey:
    | "special_req_hard_back"
    | "special_req_embossing"
    | "special_req_gold_foil"
    | "special_req_special_size"
    | "special_req_full_color"
    | "special_req_paper_stock"
    | "special_req_other";
}> = [
  { key: "hard_back", labelKey: "special_req_hard_back" },
  { key: "embossing", labelKey: "special_req_embossing" },
  { key: "gold_foil", labelKey: "special_req_gold_foil" },
  { key: "special_size", labelKey: "special_req_special_size" },
  { key: "full_color", labelKey: "special_req_full_color" },
  { key: "paper_stock", labelKey: "special_req_paper_stock" },
  { key: "other", labelKey: "special_req_other" },
];
const SPECIAL_REQUIREMENT_PAYLOAD_MAP: Record<
  SpecialRequirementKey,
  QuoteSpecialRequirementPayload
> = {
  hard_back: "hardback",
  embossing: "embossing",
  gold_foil: "gold_foil",
  special_size: "special_size",
  full_color: "full_color_interior",
  paper_stock: "special_paper",
  other: "other",
};
const INITIAL_ESTIMATOR_STATE: QuoteEstimatorState = {
  status: "idle",
  requestKey: null,
  estimatedPriceLow: null,
  estimatedPriceHigh: null,
  errorMessage: null,
};

const INITIAL_FORM_STATE: QuoteShellState = {
  workingTitle: "",
  estimatedWordCount: "",
  bookSize: "",
  quantity: "",
  hasSpecialRequirements: false,
  specialRequirements: {
    hard_back: false,
    embossing: false,
    gold_foil: false,
    special_size: false,
    full_color: false,
    paper_stock: false,
    other: false,
  },
  specialRequirementsOther: "",
  fullName: "",
  email: "",
  phone: "",
};
const INITIAL_TOUCHED_STATE: FieldTouched = {
  workingTitle: false,
  estimatedWordCount: false,
  bookSize: false,
  quantity: false,
  fullName: false,
  email: false,
  phone: false,
};

const inputClassName =
  "mt-2 min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-transparent px-4 py-3 font-sans text-sm text-white placeholder:text-white/45 transition-colors duration-300 focus:border-[#007eff] focus:outline-none";
const inputErrorClassName = "border-[#EF4444] focus:border-[#EF4444]";
const errorTextClassName = "mt-2 font-sans text-xs text-[#EF4444]";

const workingTitleSchema = z
  .string()
  .trim()
  .min(1, { message: "error_working_title_required" })
  .max(200, { message: "error_working_title_max" });

const estimatedWordCountSchema = z
  .string()
  .trim()
  .min(1, { message: "error_word_count_required" })
  .regex(/^\d+$/, { message: "error_word_count_integer" })
  .refine((value) => Number(value) >= 1, { message: "error_word_count_min" });

const bookSizeSchema = z
  .string()
  .trim()
  .refine((value) => BOOK_SIZES.includes(value as (typeof BOOK_SIZES)[number]), {
    message: "error_book_size_required",
  });

const quantitySchema = z
  .string()
  .trim()
  .min(1, { message: "error_quantity_required" })
  .regex(/^\d+$/, { message: "error_quantity_integer" })
  .refine((value) => Number(value) >= 1, { message: "error_quantity_min" });

const fullNameSchema = z
  .string()
  .trim()
  .min(1, { message: "error_full_name_required" })
  .refine((value) => value.length >= 2, { message: "error_full_name_min" });

const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "error_email_required" })
  .email({ message: "error_email_invalid" });

const phoneSchema = z
  .string()
  .trim()
  .min(1, { message: "error_phone_required" })
  .refine((value) => value.replace(/\D/g, "").length >= 7, { message: "error_phone_min_digits" });

function getSchemaMessage(schema: z.ZodType<unknown>, value: unknown): string | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? null;
}

function setFieldErrorValue(errors: FieldErrors, field: StepField, value?: string): FieldErrors {
  const nextErrors = { ...errors };
  if (value) {
    nextErrors[field] = value;
  } else {
    delete nextErrors[field];
  }
  return nextErrors;
}

function getApiV1BaseUrl(): string {
  if (typeof window !== "undefined") return "/api/v1";

  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
  if (base.endsWith("/api/v1")) return base;
  return `${base}/api/v1`;
}

function formatNaira(value: number): string {
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Math.max(0, value))}`;
}

function parseIntegerValue(value: string): number {
  return Number.parseInt(value, 10);
}

function waitForEstimateLoadingDuration(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function cleanup() {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
    }

    function handleAbort() {
      cleanup();
      resolve();
    }

    if (signal) {
      if (signal.aborted) {
        cleanup();
        resolve();
        return;
      }
      signal.addEventListener("abort", handleAbort, { once: true });
    }
  });
}

// biome-ignore lint/correctness/noUnusedVariables: estimated price UI commented out temporarily
function AnimatedPriceValue({ value }: { value: number }) {
  const prefersReducedMotion = useReducedMotion();
  const previousValueRef = useRef(value);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      previousValueRef.current = value;
      return;
    }

    const controls = animate(previousValueRef.current, value, {
      duration: 0.7,
      ease: "easeOut",
      onUpdate: (latest) => {
        setDisplayValue(Math.round(latest));
      },
    });
    previousValueRef.current = value;

    return () => controls.stop();
  }, [prefersReducedMotion, value]);

  return <>{formatNaira(displayValue)}</>;
}

export function QuoteView() {
  return (
    <RecaptchaProvider>
      <QuoteViewInner />
    </RecaptchaProvider>
  );
}

function QuoteViewInner() {
  const t = useTranslations("quote");
  const { executeRecaptcha } = useGoogleReCaptcha();
  const { lenis } = useLenis();
  const prefersReducedMotion = useReducedMotion();
  const topRef = useRef<HTMLDivElement>(null);
  const bookSizeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const estimatorAbortControllerRef = useRef<AbortController | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [form, setForm] = useState<QuoteShellState>(INITIAL_FORM_STATE);
  const [touched, setTouched] = useState<FieldTouched>(INITIAL_TOUCHED_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [estimator, setEstimator] = useState<QuoteEstimatorState>(INITIAL_ESTIMATOR_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submittedQuote, setSubmittedQuote] = useState<SubmittedQuoteSummary | null>(null);
  const [estimateLoadingStage, setEstimateLoadingStage] =
    useState<EstimateLoadingStage>("calculating");

  useEffect(() => {
    const target = topRef.current;
    if (!target) return;
    const offset = currentStep === 0 ? -96 : -88;

    if (lenis) {
      lenis.scrollTo(target, {
        offset,
        duration: prefersReducedMotion ? 0 : 0.6,
      });
      return;
    }

    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [currentStep, lenis, prefersReducedMotion]);

  const validateFieldValue = useCallback((field: StepField, value: string): string | null => {
    switch (field) {
      case "workingTitle":
        return getSchemaMessage(workingTitleSchema, value);
      case "estimatedWordCount":
        return getSchemaMessage(estimatedWordCountSchema, value);
      case "bookSize":
        return getSchemaMessage(bookSizeSchema, value);
      case "quantity":
        return getSchemaMessage(quantitySchema, value);
      case "fullName":
        return getSchemaMessage(fullNameSchema, value);
      case "email":
        return getSchemaMessage(emailSchema, value);
      case "phone":
        return getSchemaMessage(phoneSchema, value);
      default:
        return null;
    }
  }, []);

  const getFieldErrorMessage = useCallback(
    (field: StepField, value: string): string | undefined => {
      const messageKey = validateFieldValue(field, value);
      if (!messageKey) return undefined;
      return t(messageKey);
    },
    [t, validateFieldValue]
  );

  const updateField = useCallback(
    (field: StepField, value: string) => {
      setForm((previousForm) => ({
        ...previousForm,
        [field]: value,
      }));

      if (!touched[field]) return;

      const nextError = getFieldErrorMessage(field, value);
      setErrors((previousErrors) => setFieldErrorValue(previousErrors, field, nextError));
    },
    [getFieldErrorMessage, touched]
  );

  const validateFieldOnBlur = useCallback(
    (field: StepField) => {
      setTouched((previousTouched) => ({ ...previousTouched, [field]: true }));

      const value = form[field];
      const nextError = getFieldErrorMessage(field, value);
      setErrors((previousErrors) => setFieldErrorValue(previousErrors, field, nextError));
    },
    [form, getFieldErrorMessage]
  );

  const stepLabels = useMemo(
    () => [t("step_1_label"), t("step_2_label"), t("step_3_label"), t("step_4_label")],
    [t]
  );

  const specialRequirementsPayload = useMemo(
    () =>
      SPECIAL_REQUIREMENT_OPTIONS.filter(({ key }) => form.specialRequirements[key]).map(
        ({ key }) => SPECIAL_REQUIREMENT_PAYLOAD_MAP[key]
      ),
    [form.specialRequirements]
  );
  const hasSpecialReqs = specialRequirementsPayload.length > 0;
  const hasOtherSpecialRequirement = form.specialRequirements.other;
  const selectedBookSizeIndex = form.bookSize === "" ? -1 : BOOK_SIZES.indexOf(form.bookSize);

  const step1Valid =
    !validateFieldValue("workingTitle", form.workingTitle) &&
    !validateFieldValue("estimatedWordCount", form.estimatedWordCount);
  const step2Valid =
    !validateFieldValue("bookSize", form.bookSize) &&
    !validateFieldValue("quantity", form.quantity);
  const step4Valid =
    !validateFieldValue("fullName", form.fullName) &&
    !validateFieldValue("email", form.email) &&
    !validateFieldValue("phone", form.phone);

  const estimatorInput = useMemo(() => {
    if (!step1Valid || !step2Valid || form.bookSize === "") return null;

    return {
      estimatedWordCount: parseIntegerValue(form.estimatedWordCount),
      bookSize: form.bookSize as QuoteBookSize,
      quantity: parseIntegerValue(form.quantity),
    };
  }, [form.bookSize, form.estimatedWordCount, form.quantity, step1Valid, step2Valid]);
  const estimatorRequestKey = estimatorInput
    ? `${estimatorInput.estimatedWordCount}-${estimatorInput.bookSize}-${estimatorInput.quantity}`
    : null;
  const isEstimatorLoadingForCurrentInput =
    estimator.status === "loading" && estimator.requestKey === estimatorRequestKey;
  const hasEstimatorErrorForCurrentInput =
    estimator.status === "error" && estimator.requestKey === estimatorRequestKey;
  const isEstimatorReadyForCurrentInput =
    estimator.status === "ready" &&
    estimator.requestKey === estimatorRequestKey &&
    estimator.estimatedPriceLow !== null &&
    estimator.estimatedPriceHigh !== null;
  const shouldShowEstimator = currentStep === STEP_COUNT - 1 && !hasSpecialReqs;
  const shouldShowManualPricingNote = currentStep === STEP_COUNT - 1 && hasSpecialReqs;

  const disableNextButton =
    (currentStep === 0 && !step1Valid) || (currentStep === 1 && !step2Valid);
  const disableSubmitButton =
    currentStep === STEP_COUNT - 1 &&
    (!step4Valid || isSubmitting || (shouldShowEstimator && !isEstimatorReadyForCurrentInput));
  // biome-ignore lint/correctness/noUnusedVariables: estimated price UI commented out temporarily
  const estimateLoadingMessageKey =
    estimateLoadingStage === "finalizing" ? "estimate_loading_finalizing" : "estimate_loading";
  // biome-ignore lint/correctness/noUnusedVariables: estimated price UI commented out temporarily
  const estimateLoadingProgress = estimateLoadingStage === "finalizing" ? "100%" : "68%";

  const stepTransitionVariants = {
    enter: (travelDirection: number) => ({
      x: prefersReducedMotion ? 0 : travelDirection > 0 ? 64 : -64,
      opacity: prefersReducedMotion ? 1 : 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (travelDirection: number) => ({
      x: prefersReducedMotion ? 0 : travelDirection > 0 ? -64 : 64,
      opacity: prefersReducedMotion ? 1 : 0,
    }),
  };

  const requestEstimate = useCallback(
    async (
      input: { estimatedWordCount: number; bookSize: QuoteBookSize; quantity: number },
      requestKey: string,
      signal?: AbortSignal
    ): Promise<QuoteEstimateResponse | null> => {
      const requestStartedAt = Date.now();
      setEstimator({
        status: "loading",
        requestKey,
        estimatedPriceLow: null,
        estimatedPriceHigh: null,
        errorMessage: null,
      });

      try {
        const response = await fetch(`${getApiV1BaseUrl()}/quotes/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal,
        });

        if (!response.ok) {
          await throwApiError(response, t("estimate_error_generic"));
        }

        const data = (await response.json()) as QuoteEstimateResponse;
        const remainingLoadingDuration = Math.max(
          0,
          ESTIMATE_LOADING_MIN_DURATION_MS - (Date.now() - requestStartedAt)
        );
        await waitForEstimateLoadingDuration(remainingLoadingDuration, signal);

        if (signal?.aborted) {
          setEstimator((previousState) =>
            previousState.requestKey === requestKey ? INITIAL_ESTIMATOR_STATE : previousState
          );
          return null;
        }

        setEstimator({
          status: "ready",
          requestKey,
          estimatedPriceLow: data.estimatedPriceLow,
          estimatedPriceHigh: data.estimatedPriceHigh,
          errorMessage: null,
        });
        return data;
      } catch (error) {
        if (signal?.aborted) {
          setEstimator((previousState) =>
            previousState.requestKey === requestKey ? INITIAL_ESTIMATOR_STATE : previousState
          );
          return null;
        }

        const errorMessage =
          error instanceof RateLimitError
            ? t("estimate_error_rate_limited", {
                minutes: toRetryAfterMinutes(error.retryAfterSeconds),
              })
            : error instanceof Error && error.message.trim().length > 0
              ? error.message
              : t("estimate_error_generic");

        const remainingLoadingDuration = Math.max(
          0,
          ESTIMATE_LOADING_MIN_DURATION_MS - (Date.now() - requestStartedAt)
        );
        await waitForEstimateLoadingDuration(remainingLoadingDuration, signal);

        if (signal?.aborted) {
          setEstimator((previousState) =>
            previousState.requestKey === requestKey ? INITIAL_ESTIMATOR_STATE : previousState
          );
          return null;
        }

        setEstimator({
          status: "error",
          requestKey,
          estimatedPriceLow: null,
          estimatedPriceHigh: null,
          errorMessage,
        });
        return null;
      }
    },
    [t]
  );

  const cancelActiveEstimateRequest = useCallback(() => {
    if (!estimatorAbortControllerRef.current) return;
    estimatorAbortControllerRef.current.abort();
    estimatorAbortControllerRef.current = null;
  }, []);

  const startEstimateRequest = useCallback(
    (
      input: { estimatedWordCount: number; bookSize: QuoteBookSize; quantity: number },
      requestKey: string
    ) => {
      cancelActiveEstimateRequest();
      const controller = new AbortController();
      estimatorAbortControllerRef.current = controller;

      void requestEstimate(input, requestKey, controller.signal).finally(() => {
        if (estimatorAbortControllerRef.current === controller) {
          estimatorAbortControllerRef.current = null;
        }
      });
    },
    [cancelActiveEstimateRequest, requestEstimate]
  );

  useEffect(() => {
    return () => {
      cancelActiveEstimateRequest();
    };
  }, [cancelActiveEstimateRequest]);

  useEffect(() => {
    if (!hasSpecialReqs && estimatorInput && estimatorRequestKey) return;
    cancelActiveEstimateRequest();
    setEstimator(INITIAL_ESTIMATOR_STATE);
  }, [cancelActiveEstimateRequest, estimatorInput, estimatorRequestKey, hasSpecialReqs]);

  useEffect(() => {
    if (!shouldShowEstimator || !estimatorInput || !estimatorRequestKey) return;
    if (isEstimatorReadyForCurrentInput || isEstimatorLoadingForCurrentInput) return;
    if (hasEstimatorErrorForCurrentInput) return;

    startEstimateRequest(estimatorInput, estimatorRequestKey);
  }, [
    estimatorInput,
    estimatorRequestKey,
    hasEstimatorErrorForCurrentInput,
    isEstimatorLoadingForCurrentInput,
    isEstimatorReadyForCurrentInput,
    startEstimateRequest,
    shouldShowEstimator,
  ]);

  useEffect(() => {
    if (!isEstimatorLoadingForCurrentInput) {
      setEstimateLoadingStage("calculating");
      return;
    }

    setEstimateLoadingStage("calculating");
    const timer = window.setTimeout(() => {
      setEstimateLoadingStage("finalizing");
    }, ESTIMATE_LOADING_STAGE_FINALIZING_MS);

    return () => window.clearTimeout(timer);
  }, [isEstimatorLoadingForCurrentInput]);

  function handleNextStep() {
    if (disableNextButton) return;
    setSubmissionError(null);
    setDirection(1);
    setCurrentStep((previousStep) => Math.min(STEP_COUNT - 1, previousStep + 1));
  }

  function handleBackStep() {
    setSubmissionError(null);
    setDirection(-1);
    setCurrentStep((previousStep) => Math.max(0, previousStep - 1));
  }

  async function handleSubmitShell() {
    if (disableSubmitButton) return;

    setSubmissionError(null);
    setIsSubmitting(true);

    try {
      let estimateLow: number | null = null;
      let estimateHigh: number | null = null;

      if (!hasSpecialReqs) {
        if (!estimatorInput || !estimatorRequestKey) {
          throw new Error(t("estimate_error_generic"));
        }

        const estimateResponse =
          isEstimatorReadyForCurrentInput &&
          estimator.estimatedPriceLow !== null &&
          estimator.estimatedPriceHigh !== null
            ? {
                estimatedPriceLow: estimator.estimatedPriceLow,
                estimatedPriceHigh: estimator.estimatedPriceHigh,
              }
            : await requestEstimate(estimatorInput, estimatorRequestKey);

        if (!estimateResponse) {
          throw new Error(t("estimate_error_generic"));
        }

        estimateLow = estimateResponse.estimatedPriceLow;
        estimateHigh = estimateResponse.estimatedPriceHigh;
      }

      const recaptchaToken = executeRecaptcha
        ? await executeRecaptcha("quote_submission_form")
        : undefined;

      const response = await fetch(`${getApiV1BaseUrl()}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workingTitle: form.workingTitle.trim(),
          estimatedWordCount: parseIntegerValue(form.estimatedWordCount),
          bookSize: form.bookSize,
          quantity: parseIntegerValue(form.quantity),
          coverType: "paperback",
          hasSpecialReqs,
          specialRequirements: specialRequirementsPayload,
          specialRequirementsOther: hasOtherSpecialRequirement
            ? form.specialRequirementsOther.trim()
            : "",
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          estimatedPriceLow: hasSpecialReqs ? null : estimateLow,
          estimatedPriceHigh: hasSpecialReqs ? null : estimateHigh,
          recaptchaToken,
        }),
      });

      if (!response.ok) {
        await throwApiError(response, t("submit_error_generic"));
      }

      await response.json().catch(() => null);
      const firstName = form.fullName.trim().split(/\s+/)[0] || form.fullName.trim();

      trackQuoteSubmitted(form.bookSize, hasSpecialReqs);
      setSubmittedQuote({
        firstName,
        workingTitle: form.workingTitle.trim(),
        bookSize: form.bookSize as QuoteBookSize,
        quantity: parseIntegerValue(form.quantity),
        hasSpecialReqs,
        estimatedPriceLow: hasSpecialReqs ? null : estimateLow,
        estimatedPriceHigh: hasSpecialReqs ? null : estimateHigh,
      });
    } catch (error) {
      const errorMessage =
        error instanceof RateLimitError
          ? t("submit_error_rate_limited", {
              minutes: toRetryAfterMinutes(error.retryAfterSeconds),
            })
          : error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("submit_error_generic");

      setSubmissionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  function setBookSize(value: (typeof BOOK_SIZES)[number]) {
    updateField("bookSize", value);
    setTouched((previousTouched) => ({
      ...previousTouched,
      bookSize: true,
    }));
  }

  function toggleSpecialRequirementsEnabled(enabled: boolean) {
    setForm((previousForm) => ({
      ...previousForm,
      hasSpecialRequirements: enabled,
      specialRequirements: enabled
        ? previousForm.specialRequirements
        : INITIAL_FORM_STATE.specialRequirements,
      specialRequirementsOther: enabled ? previousForm.specialRequirementsOther : "",
    }));
  }

  function toggleSpecialRequirement(key: SpecialRequirementKey) {
    setForm((previousForm) => {
      const nextCheckedValue = !previousForm.specialRequirements[key];
      const nextSpecialRequirements = {
        ...previousForm.specialRequirements,
        [key]: nextCheckedValue,
      };

      return {
        ...previousForm,
        specialRequirements: nextSpecialRequirements,
        specialRequirementsOther:
          key === "other" && !nextCheckedValue ? "" : previousForm.specialRequirementsOther,
      };
    });
  }

  function handleBookSizeCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = -1;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % BOOK_SIZES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + BOOK_SIZES.length) % BOOK_SIZES.length;
    }

    if (nextIndex < 0) return;

    event.preventDefault();
    const nextSize = BOOK_SIZES[nextIndex];
    setBookSize(nextSize);
    bookSizeRefs.current[nextIndex]?.focus();
  }

  function renderStepBody() {
    switch (currentStep) {
      case 0: {
        const workingTitleError = touched.workingTitle ? errors.workingTitle : undefined;
        const estimatedWordCountError = touched.estimatedWordCount
          ? errors.estimatedWordCount
          : undefined;

        return (
          <div className="space-y-5">
            <div>
              <label htmlFor="working-title" className="font-sans text-sm font-medium text-white">
                {t("working_title_label")}
              </label>
              <input
                id="working-title"
                name="working-title"
                type="text"
                aria-label={t("working_title_label")}
                aria-required
                aria-invalid={Boolean(workingTitleError)}
                aria-describedby={workingTitleError ? "quote-working-title-error" : undefined}
                required
                maxLength={200}
                value={form.workingTitle}
                onChange={(event) => updateField("workingTitle", event.target.value)}
                onBlur={() => validateFieldOnBlur("workingTitle")}
                className={cn(inputClassName, workingTitleError ? inputErrorClassName : "")}
                placeholder={t("working_title_placeholder")}
              />
              {workingTitleError ? (
                <p id="quote-working-title-error" role="alert" className={errorTextClassName}>
                  {workingTitleError}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="estimated-word-count"
                className="font-sans text-sm font-medium text-white"
              >
                {t("estimated_word_count_label")}
              </label>
              <input
                id="estimated-word-count"
                name="estimated-word-count"
                type="number"
                inputMode="numeric"
                min={1}
                pattern="[0-9]*"
                aria-label={t("estimated_word_count_label")}
                aria-required
                aria-invalid={Boolean(estimatedWordCountError)}
                aria-describedby={
                  estimatedWordCountError ? "quote-estimated-word-count-error" : undefined
                }
                required
                value={form.estimatedWordCount}
                onChange={(event) => updateField("estimatedWordCount", event.target.value)}
                onBlur={() => validateFieldOnBlur("estimatedWordCount")}
                className={cn(inputClassName, estimatedWordCountError ? inputErrorClassName : "")}
                placeholder={t("estimated_word_count_placeholder")}
              />
              {estimatedWordCountError ? (
                <p
                  id="quote-estimated-word-count-error"
                  role="alert"
                  className={errorTextClassName}
                >
                  {estimatedWordCountError}
                </p>
              ) : null}
            </div>
          </div>
        );
      }

      case 1: {
        const bookSizeError = touched.bookSize ? errors.bookSize : undefined;
        const quantityError = touched.quantity ? errors.quantity : undefined;

        return (
          <div className="space-y-5">
            <div>
              <p className="font-sans text-sm font-medium text-white">{t("book_size_label")}</p>
              <div
                id="quote-book-size-group"
                className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3"
                role="radiogroup"
                aria-label={t("book_size_label")}
                aria-invalid={Boolean(bookSizeError)}
                aria-describedby={bookSizeError ? "quote-book-size-error" : undefined}
              >
                {BOOK_SIZES.map((size, index) => {
                  const isSelected = form.bookSize === size;
                  const tabIndex =
                    selectedBookSizeIndex === -1
                      ? index === 0
                        ? 0
                        : -1
                      : selectedBookSizeIndex === index
                        ? 0
                        : -1;

                  return (
                    <motion.button
                      key={size}
                      type="button"
                      ref={(element) => {
                        bookSizeRefs.current[index] = element;
                      }}
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${t("book_size_label")} ${size}`}
                      tabIndex={tabIndex}
                      onClick={() => setBookSize(size)}
                      onBlur={() => validateFieldOnBlur("bookSize")}
                      onKeyDown={(event) => handleBookSizeCardKeyDown(event, index)}
                      className={cn(
                        "min-h-11 rounded-xl border px-4 py-3 text-left font-sans text-sm font-semibold transition-colors",
                        isSelected
                          ? "border-[#007eff] bg-[#007eff]/15 text-white"
                          : "border-[#2A2A2A] bg-transparent text-white/80 hover:border-white/35",
                        bookSizeError ? "border-[#EF4444]" : ""
                      )}
                      animate={{
                        scale: isSelected ? 1.02 : 1,
                      }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
                    >
                      {size}
                    </motion.button>
                  );
                })}
              </div>
              {bookSizeError ? (
                <p id="quote-book-size-error" role="alert" className={errorTextClassName}>
                  {bookSizeError}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="quote-quantity" className="font-sans text-sm font-medium text-white">
                {t("quantity_label")}
              </label>
              <input
                id="quote-quantity"
                name="quote-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                pattern="[0-9]*"
                aria-label={t("quantity_label")}
                aria-required
                aria-invalid={Boolean(quantityError)}
                aria-describedby={quantityError ? "quote-quantity-error" : undefined}
                required
                value={form.quantity}
                onChange={(event) => updateField("quantity", event.target.value)}
                onBlur={() => validateFieldOnBlur("quantity")}
                className={cn(inputClassName, quantityError ? inputErrorClassName : "")}
                placeholder={t("quantity_placeholder")}
              />
              {quantityError ? (
                <p id="quote-quantity-error" role="alert" className={errorTextClassName}>
                  {quantityError}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#2A2A2A] bg-white/[0.02] px-4 py-3">
              <p className="font-sans text-xs font-medium tracking-wide text-white/55 uppercase">
                {t("cover_type_label")}
              </p>
              <p className="mt-1 font-sans text-sm font-semibold text-white">
                {t("cover_type_value")}
              </p>
            </div>
          </div>
        );
      }

      case 2:
        return (
          <div className="space-y-5">
            <label
              htmlFor="quote-has-special-requirements"
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-[#2A2A2A] px-4 py-3 text-left transition-colors hover:border-white/35 focus-within:outline-none focus-within:ring-2 focus-within:ring-[#007eff]"
            >
              <input
                id="quote-has-special-requirements"
                type="checkbox"
                checked={form.hasSpecialRequirements}
                aria-label={t("special_reqs_label")}
                aria-controls="quote-special-requirements-options"
                onChange={(event) => toggleSpecialRequirementsEnabled(event.target.checked)}
                className="sr-only"
              />
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded border transition-colors",
                  form.hasSpecialRequirements ? "border-[#007eff] bg-[#007eff]" : "border-[#2A2A2A]"
                )}
              >
                {form.hasSpecialRequirements ? <Check className="size-3.5 text-white" /> : null}
              </span>
              <span className="font-sans text-sm font-medium text-white">
                {t("special_reqs_label")}
              </span>
            </label>

            <AnimatePresence initial={false}>
              {form.hasSpecialRequirements ? (
                <motion.div
                  id="quote-special-requirements-options"
                  key="special-requirements-options"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 rounded-xl border border-[#2A2A2A] bg-white/[0.02] p-4">
                    <p className="font-sans text-xs font-medium tracking-wide text-white/55 uppercase">
                      {t("special_reqs_hint")}
                    </p>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {SPECIAL_REQUIREMENT_OPTIONS.map(({ key, labelKey }) => {
                        const checked = form.specialRequirements[key];

                        return (
                          <label
                            key={key}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[#2A2A2A] px-3 py-2 text-left transition-colors hover:border-white/35 focus-within:outline-none focus-within:ring-2 focus-within:ring-[#007eff]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              aria-label={t(labelKey)}
                              onChange={() => toggleSpecialRequirement(key)}
                              className="sr-only"
                            />
                            <span
                              className={cn(
                                "flex size-5 items-center justify-center rounded border transition-colors",
                                checked ? "border-[#007eff] bg-[#007eff]" : "border-[#2A2A2A]"
                              )}
                            >
                              {checked ? <Check className="size-3.5 text-white" /> : null}
                            </span>
                            <span className="font-sans text-sm text-white">{t(labelKey)}</span>
                          </label>
                        );
                      })}
                    </div>

                    <AnimatePresence initial={false}>
                      {hasOtherSpecialRequirement ? (
                        <motion.div
                          key="special-requirements-other"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: prefersReducedMotion ? 0 : 0.25,
                            ease: "easeOut",
                          }}
                          className="overflow-hidden"
                        >
                          <textarea
                            id="special-requirements-other"
                            name="special-requirements-other"
                            aria-label={t("special_req_other")}
                            aria-required={hasOtherSpecialRequirement || undefined}
                            value={form.specialRequirementsOther}
                            onChange={(event) =>
                              setForm((previousForm) => ({
                                ...previousForm,
                                specialRequirementsOther: event.target.value,
                              }))
                            }
                            className={cn(inputClassName, "min-h-28 resize-y")}
                            placeholder={t("special_req_other_placeholder")}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <p className="font-sans text-xs text-white/55" aria-live="polite">
              {hasSpecialReqs ? t("special_reqs_selected") : t("special_reqs_unselected")}
            </p>
          </div>
        );

      case 3: {
        const fullNameError = touched.fullName ? errors.fullName : undefined;
        const emailError = touched.email ? errors.email : undefined;
        const phoneError = touched.phone ? errors.phone : undefined;

        return (
          <div className="space-y-5">
            <div>
              <label htmlFor="quote-full-name" className="font-sans text-sm font-medium text-white">
                {t("full_name_label")}
              </label>
              <input
                id="quote-full-name"
                name="quote-full-name"
                type="text"
                aria-label={t("full_name_label")}
                aria-required
                aria-invalid={Boolean(fullNameError)}
                aria-describedby={fullNameError ? "quote-full-name-error" : undefined}
                required
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                onBlur={() => validateFieldOnBlur("fullName")}
                className={cn(inputClassName, fullNameError ? inputErrorClassName : "")}
                placeholder={t("full_name_placeholder")}
              />
              {fullNameError ? (
                <p id="quote-full-name-error" role="alert" className={errorTextClassName}>
                  {fullNameError}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="quote-email" className="font-sans text-sm font-medium text-white">
                {t("email_label")}
              </label>
              <input
                id="quote-email"
                name="quote-email"
                type="email"
                aria-label={t("email_label")}
                aria-required
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "quote-email-error" : undefined}
                required
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                onBlur={() => validateFieldOnBlur("email")}
                className={cn(inputClassName, emailError ? inputErrorClassName : "")}
                placeholder={t("email_placeholder")}
              />
              {emailError ? (
                <p id="quote-email-error" role="alert" className={errorTextClassName}>
                  {emailError}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="quote-phone" className="font-sans text-sm font-medium text-white">
                {t("phone_label")}
              </label>
              <input
                id="quote-phone"
                name="quote-phone"
                type="tel"
                aria-label={t("phone_label")}
                aria-required
                aria-invalid={Boolean(phoneError)}
                aria-describedby={phoneError ? "quote-phone-error" : undefined}
                required
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                onBlur={() => validateFieldOnBlur("phone")}
                className={cn(inputClassName, phoneError ? inputErrorClassName : "")}
                placeholder={t("phone_placeholder")}
              />
              {phoneError ? (
                <p id="quote-phone-error" role="alert" className={errorTextClassName}>
                  {phoneError}
                </p>
              ) : null}
            </div>

            {/* --- Estimated price panel commented out (uncomment when needed) ---
            {shouldShowEstimator ? (
              <div className="rounded-2xl border border-[#2A2A2A] bg-white/[0.02] p-5">
                <p className="font-display text-xl font-bold text-white">{t("estimate_heading")}</p>

                {isEstimatorLoadingForCurrentInput ? (
                  <div className="mt-3 space-y-3">
                    <output
                      className="block font-sans text-sm text-white/70"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      {t(estimateLoadingMessageKey)}
                    </output>
                    <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-[#007eff]"
                        initial={false}
                        animate={{ width: estimateLoadingProgress }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.45, ease: "easeOut" }}
                      />
                      {prefersReducedMotion ? null : (
                        <motion.div
                          className="pointer-events-none absolute top-0 left-0 h-full w-14 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                          animate={{ x: ["-160%", "320%"] }}
                          transition={{
                            duration: 1.1,
                            ease: "easeInOut",
                            repeat: Number.POSITIVE_INFINITY,
                          }}
                        />
                      )}
                    </div>
                  </div>
                ) : null}

                {hasEstimatorErrorForCurrentInput ? (
                  <div className="mt-3 space-y-3">
                    <p className="font-sans text-sm text-[#EF4444]">
                      {estimator.errorMessage || t("estimate_error_generic")}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (!estimatorInput || !estimatorRequestKey) return;
                        startEstimateRequest(estimatorInput, estimatorRequestKey);
                      }}
                      className="min-h-11 rounded-lg border border-[#2A2A2A] px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:border-white/35"
                    >
                      {t("estimate_retry_button")}
                    </button>
                  </div>
                ) : null}

                {isEstimatorReadyForCurrentInput &&
                estimator.estimatedPriceLow !== null &&
                estimator.estimatedPriceHigh !== null ? (
                  <div className="mt-3">
                    <p className="font-display text-3xl font-bold text-[#007eff] sm:text-4xl">
                      <AnimatedPriceValue value={estimator.estimatedPriceLow} />
                      {" — "}
                      <AnimatedPriceValue value={estimator.estimatedPriceHigh} />
                    </p>
                    <p className="mt-3 font-serif text-sm text-white/60">{t("estimate_note")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            --- End estimated price panel --- */}

            {shouldShowManualPricingNote ? (
              <div className="rounded-2xl border border-[#2A2A2A] bg-white/[0.02] p-5">
                <p className="font-serif text-sm leading-relaxed text-white/70">
                  {t("manual_pricing_note")}
                </p>
              </div>
            ) : null}
          </div>
        );
      }

      default:
        return null;
    }
  }

  return (
    <section className="min-h-screen bg-[#000000] pt-24 pb-14 sm:pt-28 md:pb-20">
      <ScrollProgress />
      <div ref={topRef} className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <header>
          {!submittedQuote ? (
            <p className="font-sans text-xs tracking-[0.22em] text-white/45 uppercase">
              {t("step_progress", {
                current: currentStep + 1,
                total: STEP_COUNT,
              })}
            </p>
          ) : null}
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-3xl font-serif text-base leading-relaxed text-white/70 md:text-lg">
            {t("subtitle")}
          </p>
        </header>

        <AnimatePresence initial={false} mode="wait">
          {submittedQuote ? (
            <motion.div
              key="quote-confirmation"
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -20 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: "easeOut" }}
              className="mt-8 overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#050505] p-5 sm:p-7 md:p-8"
            >
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: {
                      staggerChildren: prefersReducedMotion ? 0 : 0.12,
                    },
                  },
                }}
                className="space-y-6"
              >
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="flex justify-center"
                >
                  <svg
                    width="84"
                    height="84"
                    viewBox="0 0 84 84"
                    fill="none"
                    aria-hidden="true"
                    className="text-[#007eff]"
                  >
                    <motion.circle
                      cx="42"
                      cy="42"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="2"
                      initial={{ pathLength: 0, opacity: 0.2 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.45, ease: "easeOut" }}
                    />
                    <motion.path
                      d="M25 43.5L36.5 55L59 32.5"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 0.38,
                        ease: "easeOut",
                        delay: prefersReducedMotion ? 0 : 0.15,
                      }}
                    />
                  </svg>
                </motion.div>

                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="text-center"
                >
                  <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {t("confirmation_title")}
                  </h2>
                  <p className="mt-3 font-serif text-base leading-relaxed text-white/70">
                    {t("confirmation_message", { firstName: submittedQuote.firstName })}
                  </p>
                </motion.div>

                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="rounded-2xl border border-[#2A2A2A] bg-white/[0.02] p-5"
                >
                  <p className="font-display text-lg font-bold text-white">
                    {t("confirmation_summary_title")}
                  </p>
                  <dl className="mt-4 space-y-3 font-sans text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-white/60">{t("confirmation_summary_working_title")}</dt>
                      <dd className="text-right text-white">{submittedQuote.workingTitle}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-white/60">{t("confirmation_summary_book_size")}</dt>
                      <dd className="text-right text-white">{submittedQuote.bookSize}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-white/60">{t("confirmation_summary_quantity")}</dt>
                      <dd className="text-right text-white">
                        {new Intl.NumberFormat("en-NG").format(submittedQuote.quantity)}
                      </dd>
                    </div>
                    {/* --- Estimated price row commented out (uncomment when needed) ---
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-white/60">{t("confirmation_summary_price")}</dt>
                      <dd className="text-right text-white">
                        {submittedQuote.hasSpecialReqs
                          ? t("confirmation_summary_manual_pricing")
                          : `${formatNaira(submittedQuote.estimatedPriceLow ?? 0)} — ${formatNaira(submittedQuote.estimatedPriceHigh ?? 0)}`}
                      </dd>
                    </div>
                    --- End estimated price row --- */}
                  </dl>
                </motion.div>

                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="flex justify-center"
                >
                  <Link
                    href="/"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#007eff] px-6 py-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-[#006fe0]"
                  >
                    {t("confirmation_back_home")}
                  </Link>
                </motion.div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="quote-wizard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
            >
              <div className="mt-8 rounded-2xl border border-[#2A2A2A] bg-[#050505] px-4 py-5 sm:px-6 sm:py-6">
                <div className="flex w-full items-start">
                  {stepLabels.map((stepLabel, index) => {
                    const isCompleted = index < currentStep;
                    const isActive = index === currentStep;

                    return (
                      <Fragment key={stepLabel}>
                        <div className="flex w-auto shrink-0 flex-col items-center">
                          <motion.div
                            className={cn(
                              "flex min-h-11 min-w-11 items-center justify-center rounded-full border font-sans text-sm font-semibold",
                              isActive
                                ? "border-[#007eff] bg-[#007eff] text-white"
                                : isCompleted
                                  ? "border-[#007eff] bg-[#007eff] text-white"
                                  : "border-[#2A2A2A] bg-transparent text-white/65"
                            )}
                            initial={false}
                            animate={{ scale: isActive ? 1.04 : 1 }}
                            transition={{
                              duration: prefersReducedMotion ? 0 : 0.2,
                              ease: "easeOut",
                            }}
                          >
                            {isCompleted ? <Check className="size-4" /> : index + 1}
                          </motion.div>

                          <p className="mt-2 hidden max-w-20 text-center font-sans text-[11px] leading-snug text-white/60 sm:block">
                            {stepLabel}
                          </p>
                        </div>

                        {index < stepLabels.length - 1 ? (
                          <div className="mx-2 mt-5 h-[2px] flex-1 rounded-full bg-[#2A2A2A] sm:mx-3">
                            <motion.div
                              className="h-full rounded-full bg-[#007eff]"
                              initial={false}
                              animate={{
                                width: currentStep > index ? "100%" : "0%",
                              }}
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.28,
                                ease: "easeOut",
                              }}
                            />
                          </div>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#050505] p-5 sm:p-7 md:p-8">
                <AnimatePresence initial={false} mode="wait" custom={direction}>
                  <motion.section
                    key={currentStep}
                    custom={direction}
                    variants={stepTransitionVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: "easeOut" }}
                    aria-labelledby={`quote-step-title-${currentStep}`}
                  >
                    <h2
                      id={`quote-step-title-${currentStep}`}
                      className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl"
                    >
                      {t(`step_${currentStep + 1}_title`)}
                    </h2>
                    <p className="mt-3 max-w-3xl font-serif text-base leading-relaxed text-white/70">
                      {t(`step_${currentStep + 1}_desc`)}
                    </p>

                    <div className="mt-6">{renderStepBody()}</div>
                  </motion.section>
                </AnimatePresence>
              </div>

              {submissionError ? (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-[#EF4444]/60 bg-[#EF4444]/10 px-4 py-3 font-sans text-sm text-[#FCA5A5]"
                >
                  {submissionError}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleBackStep}
                  disabled={currentStep === 0 || isSubmitting}
                  className={cn(
                    "min-h-11 w-full rounded-xl border px-5 py-3 font-sans text-sm font-semibold transition-colors sm:w-auto",
                    currentStep === 0 || isSubmitting
                      ? "cursor-not-allowed border-[#2A2A2A] text-white/35"
                      : "border-[#2A2A2A] text-white hover:border-white/40 hover:text-white"
                  )}
                >
                  {t("back_button")}
                </button>

                {currentStep < STEP_COUNT - 1 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={disableNextButton || isSubmitting}
                    className={cn(
                      "min-h-11 w-full rounded-xl px-6 py-3 font-sans text-sm font-semibold transition-colors sm:w-auto",
                      disableNextButton || isSubmitting
                        ? "cursor-not-allowed bg-[#2A2A2A] text-white/35"
                        : "bg-[#007eff] text-white hover:bg-[#006fe0]"
                    )}
                  >
                    {t("next_button")}
                  </button>
                ) : (
                  <motion.button
                    type="button"
                    onClick={handleSubmitShell}
                    disabled={disableSubmitButton}
                    whileHover={disableSubmitButton ? undefined : { scale: 1.02 }}
                    whileTap={disableSubmitButton ? undefined : { scale: 0.98 }}
                    className={cn(
                      "min-h-11 w-full rounded-xl px-6 py-3 font-sans text-sm font-semibold transition-colors sm:w-auto",
                      disableSubmitButton
                        ? "cursor-not-allowed bg-[#2A2A2A] text-white/35"
                        : "bg-[#007eff] text-white hover:bg-[#006fe0]"
                    )}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <motion.span
                          className="size-4 rounded-full border-2 border-white/40 border-t-white"
                          animate={{ rotate: 360 }}
                          transition={{
                            repeat: Number.POSITIVE_INFINITY,
                            duration: 0.8,
                            ease: "linear",
                          }}
                        />
                        {t("submit_button_loading")}
                      </span>
                    ) : (
                      t("submit_button")
                    )}
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
