"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useMemo } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import {
  BOOK_PROGRESS_STAGES,
  type BookProgressStage,
  type BookProgressTimelineStep,
} from "@/types/book-progress";

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const CONNECTOR_ANIMATION = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1] as const,
};

type BookProgressTrackerProps = {
  timeline: BookProgressTimelineStep[];
  currentStage?: BookProgressStage | null;
  rejectionReason?: string | null;
  rejectionReasonLabel?: string | null;
  locale?: string;
  className?: string;
  ariaLabel?: string;
  stageLabels?: Partial<Record<BookProgressStage, string>>;
  stateLabels?: Partial<Record<BookProgressTimelineStep["state"], string>>;
};

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function toStageLabel(value: BookProgressStage): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string | null, locale: string): string | null {
  if (!value) return null;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function createFallbackTimeline(currentStage: BookProgressStage): BookProgressTimelineStep[] {
  const currentIndex = BOOK_PROGRESS_STAGES.indexOf(currentStage);

  return BOOK_PROGRESS_STAGES.map((stage, index) => ({
    stage,
    state: index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming",
    reachedAt: null,
    sourceStatus: null,
  }));
}

function normalizeTimeline(
  timeline: BookProgressTimelineStep[],
  currentStage: BookProgressStage
): BookProgressTimelineStep[] {
  if (timeline.length === 0) {
    return createFallbackTimeline(currentStage);
  }

  const stageMap = new Map<BookProgressStage, BookProgressTimelineStep>();
  for (const step of timeline) {
    stageMap.set(step.stage, step);
  }

  return BOOK_PROGRESS_STAGES.map((stage) => {
    const existing = stageMap.get(stage);
    if (existing) return existing;

    return {
      stage,
      state: "upcoming",
      reachedAt: null,
      sourceStatus: null,
    } as const;
  });
}

function getConnectorProgress(nextStep: BookProgressTimelineStep | undefined): number {
  if (!nextStep) return 0;
  if (nextStep.state === "upcoming") return 0;
  return 1;
}

function getConnectorColor(nextStep: BookProgressTimelineStep | undefined): string {
  if (!nextStep) return "#2A2A2A";
  if (nextStep.state === "rejected") return "#EF4444";
  if (nextStep.state === "completed" || nextStep.state === "current") return "#007eff";
  return "#2A2A2A";
}

function StepNode({
  state,
  prefersReducedMotion,
}: {
  state: BookProgressTimelineStep["state"];
  prefersReducedMotion: boolean;
}) {
  const isCurrent = state === "current";
  const isCompleted = state === "completed";
  const isRejected = state === "rejected";

  const nodeClassName = isRejected
    ? "border-[#EF4444] bg-[#EF4444] text-white"
    : isCompleted || isCurrent
      ? "border-[#007eff] bg-[#007eff] text-white"
      : "border-[#2A2A2A] bg-[#2A2A2A] text-[#8f8f8f]";

  return (
    <div className="relative flex size-8 items-center justify-center">
      {isCurrent ? (
        <motion.span
          aria-hidden="true"
          data-slot="book-progress-current-ring"
          initial={false}
          animate={
            prefersReducedMotion
              ? { opacity: 1, scale: 1 }
              : { opacity: [0.7, 0, 0.7], scale: [1, 1.45, 1] }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.01 }
              : { duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }
          }
          className="pointer-events-none absolute size-10 rounded-full border border-[#007eff]/80"
        />
      ) : null}

      <span
        className={cn(
          "relative inline-flex size-8 items-center justify-center rounded-full border",
          nodeClassName
        )}
      >
        {isCompleted ? (
          <Check className="size-4" aria-hidden="true" />
        ) : isRejected ? (
          <X className="size-4" aria-hidden="true" />
        ) : (
          <span
            className={cn("size-1.5 rounded-full", isCurrent ? "bg-white" : "bg-[#8f8f8f]")}
            aria-hidden="true"
          />
        )}
      </span>
    </div>
  );
}

function VerticalConnector({
  progress,
  color,
  prefersReducedMotion,
}: {
  progress: number;
  color: string;
  prefersReducedMotion: boolean;
}) {
  return (
    <div className="mt-1 flex min-h-10 w-2 justify-center">
      <svg
        viewBox="0 0 8 56"
        width="8"
        height="56"
        aria-hidden="true"
        className="block shrink-0 overflow-visible"
      >
        <path d="M4 0 L4 56" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />
        <motion.path
          d="M4 0 L4 56"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          initial={false}
          animate={{ pathLength: progress }}
          transition={prefersReducedMotion ? { duration: 0.01 } : CONNECTOR_ANIMATION}
          style={{ pathLength: progress, transformOrigin: "50% 0%" }}
        />
      </svg>
    </div>
  );
}

function HorizontalConnector({
  progress,
  color,
  prefersReducedMotion,
}: {
  progress: number;
  color: string;
  prefersReducedMotion: boolean;
}) {
  return (
    <div className="mx-2 flex h-2 flex-1 items-center">
      <svg viewBox="0 0 100 8" width="100%" height="8" aria-hidden="true" className="block w-full">
        <path d="M0 4 L100 4" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />
        <motion.path
          d="M0 4 L100 4"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          initial={false}
          animate={{ pathLength: progress }}
          transition={prefersReducedMotion ? { duration: 0.01 } : CONNECTOR_ANIMATION}
          style={{ pathLength: progress, transformOrigin: "0% 50%" }}
        />
      </svg>
    </div>
  );
}

function StepText({
  step,
  locale,
  label,
  rejectionReason,
  rejectionReasonLabel,
}: {
  step: BookProgressTimelineStep;
  locale: string;
  label: string;
  rejectionReason: string | null;
  rejectionReasonLabel: string | null;
}) {
  const timestamp = formatTimestamp(step.reachedAt, locale);
  const isCurrent = step.state === "current";
  const isRejected = step.state === "rejected";
  const isCompleted = step.state === "completed";

  return (
    <div className="min-w-0">
      <p
        className={cn(
          "font-display text-[13px] leading-snug tracking-tight",
          isRejected
            ? "font-semibold text-[#EF4444]"
            : isCurrent
              ? "font-semibold text-white"
              : step.state === "upcoming"
                ? "font-medium text-[#8f8f8f]"
                : "font-medium text-[#d9d9d9]"
        )}
      >
        {label}
      </p>

      {isCompleted && timestamp ? (
        <p className="font-sans mt-1 text-[11px] text-[#bdbdbd]">{timestamp}</p>
      ) : null}

      {isRejected && rejectionReason ? (
        <p className="font-sans mt-1 text-xs text-[#fca5a5]">
          {rejectionReasonLabel ? `${rejectionReasonLabel}: ${rejectionReason}` : rejectionReason}
        </p>
      ) : null}
    </div>
  );
}

export function BookProgressTracker({
  timeline,
  currentStage = "PAYMENT_RECEIVED",
  rejectionReason = null,
  rejectionReasonLabel = null,
  locale = "en",
  className,
  ariaLabel = "Book production progress",
  stageLabels,
  stateLabels,
}: BookProgressTrackerProps) {
  const prefersReducedMotion = useReducedMotion();
  const resolvedCurrentStage = currentStage ?? "PAYMENT_RECEIVED";

  const normalizedTimeline = useMemo(
    () => normalizeTimeline(timeline, resolvedCurrentStage),
    [timeline, resolvedCurrentStage]
  );

  return (
    <section
      aria-label={ariaLabel}
      className={cn("rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-6", className)}
    >
      <ol className="space-y-1 md:hidden">
        {normalizedTimeline.map((step, index) => {
          const nextStep = normalizedTimeline[index + 1];
          const connectorProgress = getConnectorProgress(nextStep);
          const connectorColor = getConnectorColor(nextStep);
          const label = stageLabels?.[step.stage] ?? toStageLabel(step.stage);

          return (
            <li
              key={`mobile-${step.stage}`}
              data-stage={step.stage}
              data-step-state={step.state}
              aria-label={`${label} - ${stateLabels?.[step.state] ?? step.state}`}
              className="grid grid-cols-[2rem_1fr] gap-3"
            >
              <div className="flex flex-col items-center">
                <StepNode state={step.state} prefersReducedMotion={prefersReducedMotion} />
                {index < normalizedTimeline.length - 1 ? (
                  <VerticalConnector
                    progress={connectorProgress}
                    color={connectorColor}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                ) : (
                  <div className="h-3" aria-hidden="true" />
                )}
              </div>

              <div className="pt-1 pb-3">
                <StepText
                  step={step}
                  locale={locale}
                  label={label}
                  rejectionReason={step.state === "rejected" ? rejectionReason : null}
                  rejectionReasonLabel={rejectionReasonLabel}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <ol className="hidden md:flex md:items-start md:justify-between md:gap-0">
        {normalizedTimeline.map((step, index) => {
          const nextStep = normalizedTimeline[index + 1];
          const connectorProgress = getConnectorProgress(nextStep);
          const connectorColor = getConnectorColor(nextStep);
          const label = stageLabels?.[step.stage] ?? toStageLabel(step.stage);

          return (
            <li
              key={`desktop-${step.stage}`}
              data-stage={step.stage}
              data-step-state={step.state}
              aria-label={`${label} - ${stateLabels?.[step.state] ?? step.state}`}
              className="min-w-0 flex-1"
            >
              <div className="flex items-center">
                <StepNode state={step.state} prefersReducedMotion={prefersReducedMotion} />
                {index < normalizedTimeline.length - 1 ? (
                  <HorizontalConnector
                    progress={connectorProgress}
                    color={connectorColor}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                ) : null}
              </div>

              <div className="mt-3 pr-2">
                <StepText
                  step={step}
                  locale={locale}
                  label={label}
                  rejectionReason={step.state === "rejected" ? rejectionReason : null}
                  rejectionReasonLabel={rejectionReasonLabel}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
