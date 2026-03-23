"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useProcessingStream } from "@/hooks/useProcessingStream";
import { cn } from "@/lib/utils";
import type { BookProcessingState, BookProcessingStep } from "@/types/book-progress";

// ─── Constants ──────────────────────────────────────────────

const CHUNK_TRIGGER_WORD_COUNT = 12_000;
const TARGET_CHUNK_WORDS = 10_000;
const PARALLEL_CHUNK_CONCURRENCY = 3;
const AVG_SECONDS_PER_CHUNK = 12;
const GOTENBERG_ESTIMATE_SECONDS = 8;
const TIP_ROTATION_INTERVAL_MS = 8_000;
const PERSISTENCE_KEY = "bp:processing-state";

// ─── Types ──────────────────────────────────────────────────

type StepId =
  | "MANUSCRIPT_UPLOADED"
  | "TEXT_EXTRACTED"
  | "AI_FORMATTING"
  | "COUNTING_PAGES"
  | "GENERATING_PREVIEW";

type StepState = "completed" | "active" | "pending";

interface StepDefinition {
  id: StepId;
  state: StepState;
  label: string;
  detail: string | null;
}

type ProcessingPhase = "processing" | "completed" | "idle";

interface PersistedProcessingState {
  bookId: string;
  phase: ProcessingPhase;
  currentStep: BookProcessingStep | null;
  startedAt: string | null;
  wordCount: number | null;
  timestamp: number;
}

// ─── Estimation logic ───────────────────────────────────────

function estimateChunkCount(wordCount: number | null): number {
  if (!wordCount || wordCount <= CHUNK_TRIGGER_WORD_COUNT) return 1;
  return Math.ceil(wordCount / TARGET_CHUNK_WORDS);
}

function estimateRemainingSeconds(params: {
  wordCount: number | null;
  currentStep: BookProcessingStep | null;
  startedAt: string | null;
}): number | null {
  const { wordCount, currentStep, startedAt } = params;
  if (!currentStep) return null;

  const chunks = estimateChunkCount(wordCount);
  const parallelBatches = Math.ceil(chunks / PARALLEL_CHUNK_CONCURRENCY);
  const totalAiSeconds = parallelBatches * AVG_SECONDS_PER_CHUNK;
  const totalEstimate = totalAiSeconds + GOTENBERG_ESTIMATE_SECONDS;

  const elapsedSeconds = startedAt
    ? Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000)
    : 0;

  // Estimate based on current step position
  let stepFraction = 0;
  if (currentStep === "AI_FORMATTING") {
    stepFraction = elapsedSeconds / Math.max(totalAiSeconds, 1);
  } else if (currentStep === "COUNTING_PAGES") {
    stepFraction = totalAiSeconds / totalEstimate;
  } else if (currentStep === "RENDERING_PREVIEW") {
    stepFraction = (totalAiSeconds + GOTENBERG_ESTIMATE_SECONDS * 0.5) / totalEstimate;
  }

  const remaining = Math.max(0, totalEstimate - totalEstimate * Math.min(stepFraction, 0.95));
  return Math.ceil(remaining);
}

// ─── Persistence ────────────────────────────────────────────

function persistProcessingState(state: PersistedProcessingState): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota or SSR — non-critical
  }
}

function loadPersistedState(bookId: string): PersistedProcessingState | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(PERSISTENCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProcessingState;
    if (parsed.bookId !== bookId) return null;
    // Expire after 30 minutes
    if (Date.now() - parsed.timestamp > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedState(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(PERSISTENCE_KEY);
  } catch {
    // non-critical
  }
}

// ─── Component ──────────────────────────────────────────────

export interface ProcessingProgressStepperProps {
  bookId: string;
  processing: BookProcessingState;
  wordCount: number | null;
  hasUploadedManuscript: boolean;
  isSettingsRerun: boolean;
  /** Called when user clicks "View Preview" after completion */
  onViewPreview?: () => void;
}

export function ProcessingProgressStepper({
  bookId,
  processing,
  wordCount,
  hasUploadedManuscript,
  isSettingsRerun,
  onViewPreview,
}: ProcessingProgressStepperProps) {
  const t = useTranslations("dashboard");
  const prefersReducedMotion = useReducedMotion();
  const [tipIndex, setTipIndex] = useState(0);
  const [phase, setPhase] = useState<ProcessingPhase>("idle");
  const [elapsedTick, setElapsedTick] = useState(() => Date.now());
  const prevProcessingRef = useRef(processing.isActive);
  const completionTimestampRef = useRef<number | null>(null);

  // ─── SSE real-time stream ───────────────────────────────

  const sse = useProcessingStream(bookId, processing.isActive);

  // Merge SSE data with polling data — SSE takes precedence when connected
  const effectiveStep: BookProcessingStep | null =
    sse.isConnected && sse.currentStep ? sse.currentStep : processing.currentStep;

  // Use SSE completion to trigger phase change faster than polling
  useEffect(() => {
    if (sse.isComplete && phase === "processing") {
      setPhase("completed");
      completionTimestampRef.current = Date.now();
      clearPersistedState();
    }
  }, [sse.isComplete, phase]);

  // ─── Resolve processing phase ───────────────────────────

  useEffect(() => {
    const wasActive = prevProcessingRef.current;
    const isActive = processing.isActive;
    prevProcessingRef.current = isActive;

    if (isActive) {
      setPhase("processing");
      completionTimestampRef.current = null;
    } else if (wasActive && !isActive && hasUploadedManuscript) {
      // Just finished
      setPhase("completed");
      completionTimestampRef.current = Date.now();
      clearPersistedState();
    }
    // If neither active nor just completed → stay wherever we are
  }, [processing.isActive, hasUploadedManuscript]);

  // Initialize from persisted state on mount
  useEffect(() => {
    if (processing.isActive) return; // Real-time data takes precedence
    const persisted = loadPersistedState(bookId);
    if (persisted?.phase === "processing") {
      setPhase("processing");
    } else if (persisted?.phase === "completed") {
      setPhase("completed");
    }
  }, [bookId, processing.isActive]);

  // Persist state while processing
  useEffect(() => {
    if (phase !== "processing") return;
    persistProcessingState({
      bookId,
      phase: "processing",
      currentStep: effectiveStep,
      startedAt: processing.startedAt,
      wordCount,
      timestamp: Date.now(),
    });
  }, [bookId, phase, effectiveStep, processing.startedAt, wordCount]);

  // Auto-dismiss completion after 15 seconds
  useEffect(() => {
    if (phase !== "completed") return;
    const timer = window.setTimeout(() => {
      setPhase("idle");
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Tick elapsed timer
  useEffect(() => {
    if (phase !== "processing") return;
    const timer = window.setInterval(() => setElapsedTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Rotate tips
  useEffect(() => {
    if (phase !== "processing") return;
    if (effectiveStep !== "AI_FORMATTING") return;
    const timer = window.setInterval(() => {
      setTipIndex((prev) => prev + 1);
    }, TIP_ROTATION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase, effectiveStep]);

  // Reset tip index when step changes away from AI_FORMATTING
  useEffect(() => {
    if (effectiveStep !== "AI_FORMATTING") {
      setTipIndex(0);
    }
  }, [effectiveStep]);

  // ─── Derived state ──────────────────────────────────────

  const tips = useMemo(
    () => [
      t("processing_tip_1"),
      t("processing_tip_2"),
      t("processing_tip_3"),
      t("processing_tip_4"),
      t("processing_tip_5"),
    ],
    [t]
  );

  const currentTip = tips[tipIndex % tips.length];

  const estimatedChunks = estimateChunkCount(wordCount);
  const formattedWordCount =
    typeof wordCount === "number" ? new Intl.NumberFormat().format(wordCount) : null;

  const estimatedRemaining =
    sse.isConnected && sse.estimatedSeconds !== null
      ? sse.estimatedSeconds
      : estimateRemainingSeconds({
          wordCount,
          currentStep: effectiveStep,
          startedAt: processing.startedAt,
        });

  void elapsedTick; // referenced to trigger re-render

  const elapsedSinceStart = processing.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(processing.startedAt).getTime()) / 1000))
    : null;

  const elapsedLabel =
    elapsedSinceStart !== null
      ? t("processing_started_ago", { minutes: Math.max(1, Math.floor(elapsedSinceStart / 60)) })
      : null;

  // ─── Build steps ────────────────────────────────────────

  const resolveStepState = useCallback(
    (stepId: StepId): StepState => {
      const currentStep = effectiveStep;
      const pipelineOrder: StepId[] = [
        "MANUSCRIPT_UPLOADED",
        "TEXT_EXTRACTED",
        "AI_FORMATTING",
        "COUNTING_PAGES",
        "GENERATING_PREVIEW",
      ];

      // Upload and extraction are always completed if manuscript is uploaded
      if (stepId === "MANUSCRIPT_UPLOADED" || stepId === "TEXT_EXTRACTED") {
        return hasUploadedManuscript ? "completed" : "pending";
      }

      if (phase === "completed") return "completed";

      if (!currentStep || phase !== "processing") {
        return stepId === "AI_FORMATTING" && phase === "processing" ? "active" : "pending";
      }

      // Map API step names to our step IDs
      const apiToStep: Record<string, StepId> = {
        AI_FORMATTING: "AI_FORMATTING",
        COUNTING_PAGES: "COUNTING_PAGES",
        RENDERING_PREVIEW: "GENERATING_PREVIEW",
      };
      const activeStepId = apiToStep[currentStep] ?? "AI_FORMATTING";
      const activeIdx = pipelineOrder.indexOf(activeStepId);
      const stepIdx = pipelineOrder.indexOf(stepId);

      if (stepIdx < activeIdx) return "completed";
      if (stepIdx === activeIdx) return "active";
      return "pending";
    },
    [effectiveStep, hasUploadedManuscript, phase]
  );

  const chunkDetail = useMemo(() => {
    if (effectiveStep !== "AI_FORMATTING") return null;
    if (estimatedChunks <= 1) return null;
    // Use real-time SSE chunk progress when available
    if (sse.isConnected && sse.chunkProgress) {
      return t("processing_chunks_progress", {
        completed: sse.chunkProgress.split("/")[0] ?? "0",
        total: sse.chunkProgress.split("/")[1] ?? String(estimatedChunks),
      });
    }
    // Fall back to time-based estimation
    if (!processing.startedAt) return t("processing_chunks_info", { total: estimatedChunks });
    const elapsed = (Date.now() - new Date(processing.startedAt).getTime()) / 1000;
    const estimatedPerBatch = AVG_SECONDS_PER_CHUNK;
    const completedBatches = Math.min(
      Math.floor(elapsed / estimatedPerBatch),
      Math.ceil(estimatedChunks / PARALLEL_CHUNK_CONCURRENCY) - 1
    );
    const completedChunks = Math.min(
      completedBatches * PARALLEL_CHUNK_CONCURRENCY,
      estimatedChunks
    );
    if (completedChunks <= 0) return t("processing_chunks_info", { total: estimatedChunks });
    return t("processing_chunks_progress", {
      completed: Math.min(completedChunks + PARALLEL_CHUNK_CONCURRENCY, estimatedChunks),
      total: estimatedChunks,
    });
  }, [effectiveStep, processing.startedAt, estimatedChunks, t, sse.isConnected, sse.chunkProgress]);

  const steps: StepDefinition[] = useMemo(() => {
    const result: StepDefinition[] = [];

    if (!isSettingsRerun) {
      result.push({
        id: "MANUSCRIPT_UPLOADED",
        state: resolveStepState("MANUSCRIPT_UPLOADED"),
        label: t("processing_step_uploaded"),
        detail: null,
      });
      result.push({
        id: "TEXT_EXTRACTED",
        state: resolveStepState("TEXT_EXTRACTED"),
        label: t("processing_step_extracted"),
        detail: formattedWordCount
          ? t("processing_step_extracted_detail", { wordCount: formattedWordCount })
          : null,
      });
    }

    result.push({
      id: "AI_FORMATTING",
      state: resolveStepState("AI_FORMATTING"),
      label: t("processing_step_formatting"),
      detail:
        resolveStepState("AI_FORMATTING") === "active"
          ? (chunkDetail ?? t("processing_step_formatting_detail"))
          : null,
    });
    result.push({
      id: "COUNTING_PAGES",
      state: resolveStepState("COUNTING_PAGES"),
      label: t("processing_step_counting"),
      detail:
        resolveStepState("COUNTING_PAGES") === "active"
          ? t("processing_step_counting_detail")
          : null,
    });
    result.push({
      id: "GENERATING_PREVIEW",
      state: resolveStepState("GENERATING_PREVIEW"),
      label: t("processing_step_preview"),
      detail:
        resolveStepState("GENERATING_PREVIEW") === "active"
          ? t("processing_step_preview_detail")
          : null,
    });

    return result;
  }, [isSettingsRerun, resolveStepState, t, formattedWordCount, chunkDetail]);

  // ─── Progress bar fraction ──────────────────────────────

  const progressFraction = useMemo(() => {
    if (phase === "completed") return 1;
    if (phase !== "processing") return 0;
    const activeIndex = steps.findIndex((s) => s.state === "active");
    if (activeIndex < 0) return 0;
    const completedSteps = steps.filter((s) => s.state === "completed").length;
    return (completedSteps + 0.5) / steps.length;
  }, [phase, steps]);

  // ─── Render ─────────────────────────────────────────────

  if (phase === "idle") return null;

  return (
    <div aria-live="polite" className="rounded-xl border border-[#007eff]/35 bg-[#0a1422] p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-sans text-sm font-semibold text-[#d7e8ff]">
          {phase === "completed"
            ? t("processing_complete_title")
            : isSettingsRerun
              ? t("processing_reprocessing_title")
              : t("processing_title")}
        </p>
        {phase === "processing" && processing.jobStatus ? (
          <span className="font-sans rounded-full border border-[#007eff]/40 bg-[#08111d] px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] text-[#d7e8ff] uppercase">
            {processing.jobStatus === "queued"
              ? t("book_progress_browser_preview_status_queued")
              : t("book_progress_browser_preview_status_processing")}
          </span>
        ) : null}
        {phase === "processing" && elapsedLabel ? (
          <span className="font-sans rounded-full border border-[#1d344f] bg-[#08111d] px-2.5 py-1 text-[11px] text-[#9fbce0]">
            {elapsedLabel}
          </span>
        ) : null}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#102033]">
        <motion.div
          className={cn(
            "h-full rounded-full",
            phase === "completed" ? "bg-[#22c55e]" : "bg-[#007eff]"
          )}
          initial={false}
          animate={{ width: `${Math.round(progressFraction * 100)}%` }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 180, damping: 26, mass: 0.7 }
          }
        />
      </div>

      {/* Estimated time remaining */}
      {phase === "processing" && estimatedRemaining !== null && estimatedRemaining > 0 ? (
        <p className="font-sans mt-2 text-xs text-[#9fbce0]">
          {t("processing_estimated_remaining", { seconds: estimatedRemaining })}
        </p>
      ) : null}

      {/* Estimated page count (shown during processing, before authoritative Gotenberg count) */}
      {phase === "processing" && sse.estimatedPages !== null ? (
        <p className="font-sans mt-1.5 text-xs text-[#9fbce0]">
          {t("processing_estimated_pages", { pages: sse.estimatedPages })}
        </p>
      ) : null}

      {/* Step list */}
      <div className="mt-4 space-y-0.5">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="grid grid-cols-[1.5rem_1fr] gap-3">
              {/* Icon column */}
              <div className="flex flex-col items-center">
                {step.state === "completed" ? (
                  <CheckCircle2
                    className={cn(
                      "size-5 shrink-0",
                      phase === "completed" && isLast ? "text-[#22c55e]" : "text-[#007eff]"
                    )}
                    aria-hidden="true"
                  />
                ) : step.state === "active" ? (
                  <Loader2
                    className="size-5 shrink-0 animate-spin text-[#007eff]"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle className="size-5 shrink-0 text-[#26425e]" aria-hidden="true" />
                )}
                {!isLast ? (
                  <span
                    className={cn(
                      "mt-0.5 h-5 w-px rounded-full",
                      step.state === "completed" || step.state === "active"
                        ? "bg-[#007eff]/50"
                        : "bg-[#233547]"
                    )}
                  />
                ) : null}
              </div>

              {/* Label column */}
              <div className="pb-2">
                <p
                  className={cn(
                    "font-sans text-sm font-medium leading-5",
                    step.state === "active"
                      ? "text-white"
                      : step.state === "completed"
                        ? "text-[#d7e8ff]"
                        : "text-[#6b8eaa]"
                  )}
                >
                  {step.label}
                </p>
                {step.detail ? (
                  <p
                    className={cn(
                      "font-sans mt-0.5 text-xs",
                      step.state === "active" ? "text-[#9fbce0]" : "text-[#6f8397]"
                    )}
                  >
                    {step.detail}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Educational tips — only during AI formatting */}
      {phase === "processing" && effectiveStep === "AI_FORMATTING" ? (
        <div className="mt-3 rounded-lg border border-[#1d344f] bg-[#08111d] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#007eff]" aria-hidden="true" />
            <AnimatePresence mode="wait">
              <motion.p
                key={tipIndex % tips.length}
                className="font-sans text-xs leading-relaxed text-[#9fbce0]"
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? {} : { opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
              >
                {currentTip}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      ) : null}

      {/* Completion celebration */}
      {phase === "completed" ? (
        <motion.div
          className="mt-4 flex flex-col items-center gap-3 py-2 text-center"
          initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <motion.div
            initial={prefersReducedMotion ? {} : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 }}
          >
            <CheckCircle2 className="size-10 text-[#22c55e]" aria-hidden="true" />
          </motion.div>
          <p className="font-sans text-sm font-semibold text-white">
            {t("processing_complete_message")}
          </p>
          {onViewPreview ? (
            <button
              type="button"
              onClick={onViewPreview}
              className="font-sans inline-flex min-h-10 items-center justify-center rounded-full border border-[#22c55e]/50 bg-[#0d2812] px-5 text-sm font-semibold text-white transition-colors hover:border-[#22c55e] hover:bg-[#143518]"
            >
              {t("processing_view_preview_cta")}
            </button>
          ) : null}
        </motion.div>
      ) : null}

      {/* Background processing notice */}
      {phase === "processing" ? (
        <p className="font-sans mt-3 text-xs text-[#7fa6d2]">
          {t("book_progress_browser_preview_background_notice")}
        </p>
      ) : null}
    </div>
  );
}
