"use client";

import { motion } from "framer-motion";
import { CheckCircle2, CreditCard, Factory, Package, Truck } from "lucide-react";
import type { ComponentType } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export type OrderJourneyStepKey =
  | "ORDER_CREATED"
  | "PAYMENT_CONFIRMED"
  | "IN_PRODUCTION"
  | "SHIPPED"
  | "DELIVERED";

export type OrderJourneyStepState = "completed" | "current" | "upcoming" | "issue";

export type OrderJourneyStep = {
  key: OrderJourneyStepKey;
  label: string;
  state: OrderJourneyStepState;
  reachedAt: string | null;
};

type OrderJourneyTrackerProps = {
  steps: OrderJourneyStep[];
  locale?: string;
  ariaLabel?: string;
  className?: string;
};

const STEP_ICON_MAP: Record<
  OrderJourneyStepKey,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  ORDER_CREATED: Package,
  PAYMENT_CONFIRMED: CreditCard,
  IN_PRODUCTION: Factory,
  SHIPPED: Truck,
  DELIVERED: CheckCircle2,
};

const CONNECTOR_ANIMATION = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1] as const,
};

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
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

function getConnectorProgress(nextStep: OrderJourneyStep | undefined): number {
  if (!nextStep) return 0;
  if (nextStep.state === "upcoming") return 0;
  return 1;
}

function getConnectorColor(nextStep: OrderJourneyStep | undefined): string {
  if (!nextStep) return "#2A2A2A";
  if (nextStep.state === "issue") return "#EF4444";
  if (nextStep.state === "completed" || nextStep.state === "current") return "#007eff";
  return "#2A2A2A";
}

function StepNode({
  step,
  prefersReducedMotion,
}: {
  step: OrderJourneyStep;
  prefersReducedMotion: boolean;
}) {
  const Icon = STEP_ICON_MAP[step.key];
  const isCurrent = step.state === "current";
  const isCompleted = step.state === "completed";
  const isIssue = step.state === "issue";

  const nodeClassName = isIssue
    ? "border-[#EF4444] bg-[#EF4444] text-white"
    : isCompleted || isCurrent
      ? "border-[#007eff] bg-[#007eff] text-white"
      : "border-[#2A2A2A] bg-[#2A2A2A] text-[#8f8f8f]";

  return (
    <div className="relative flex size-10 items-center justify-center">
      {isCurrent ? (
        <motion.span
          aria-hidden="true"
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
          className="pointer-events-none absolute size-12 rounded-full border border-[#007eff]/80"
        />
      ) : null}

      <span
        className={cn(
          "relative inline-flex size-10 items-center justify-center rounded-full border",
          nodeClassName
        )}
      >
        <Icon className="size-4" aria-hidden={true} />
      </span>
    </div>
  );
}

function Connector({
  progress,
  color,
  prefersReducedMotion,
}: {
  progress: number;
  color: string;
  prefersReducedMotion: boolean;
}) {
  return (
    <div className="mx-2 flex h-2 min-w-[2rem] flex-1 items-center">
      <div className="h-1 w-full rounded bg-[#2A2A2A]">
        <motion.div
          initial={false}
          animate={{ scaleX: progress }}
          transition={prefersReducedMotion ? { duration: 0.01 } : CONNECTOR_ANIMATION}
          className="h-1 origin-left rounded"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function OrderJourneyTracker({
  steps,
  locale = "en",
  ariaLabel = "Order journey tracker",
  className,
}: OrderJourneyTrackerProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      aria-label={ariaLabel}
      className={cn("rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-6", className)}
    >
      <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ol className="flex min-w-[780px] items-start">
          {steps.map((step, index) => {
            const nextStep = steps[index + 1];
            const connectorProgress = getConnectorProgress(nextStep);
            const connectorColor = getConnectorColor(nextStep);
            const timestamp = formatTimestamp(step.reachedAt, locale);

            return (
              <li key={step.key} className="min-w-0 flex-1">
                <div className="flex items-center">
                  <StepNode step={step} prefersReducedMotion={prefersReducedMotion} />
                  {index < steps.length - 1 ? (
                    <Connector
                      progress={connectorProgress}
                      color={connectorColor}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  ) : null}
                </div>
                <div className="mt-3 pr-2">
                  <p
                    className={cn(
                      "font-display text-[13px] leading-snug tracking-tight",
                      step.state === "issue"
                        ? "font-semibold text-[#EF4444]"
                        : step.state === "current"
                          ? "font-semibold text-white"
                          : step.state === "upcoming"
                            ? "font-medium text-[#8f8f8f]"
                            : "font-medium text-[#d9d9d9]"
                    )}
                  >
                    {step.label}
                  </p>
                  {timestamp ? (
                    <p className="font-sans mt-1 text-[11px] text-[#bdbdbd]">{timestamp}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
