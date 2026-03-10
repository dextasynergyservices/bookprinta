"use client";

import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  type BookFontSize,
  type BookPageSize,
  normalizeBookFontSize,
  normalizeBookPageSize,
  updateBookSettings,
} from "@/hooks/useManuscriptUpload";
import { sanitizeBookPreviewHtml } from "@/lib/sanitize-book-preview-html";
import { cn } from "@/lib/utils";
import type { BookProcessingState, BookProcessingStep } from "@/types/book-progress";

const FONT_SIZE_OPTIONS: readonly BookFontSize[] = [11, 12, 14] as const;
const PagedPolyfillUrl = "/vendor/pagedjs-polyfill.js";
const SETTINGS_LOCKED_STATUSES = new Set([
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
]);
const PREVIEW_PROCESSING_STEPS = ["AI_FORMATTING", "COUNTING_PAGES", "RENDERING_PREVIEW"] as const;
const SETTINGS_REPROCESSING_STEPS = [
  "SAVING_SETTINGS",
  "AI_FORMATTING",
  "COUNTING_PAGES",
  "RENDERING_PREVIEW",
] as const;

type PreviewProcessingStepKey = (typeof SETTINGS_REPROCESSING_STEPS)[number];

type ManuscriptPreviewPanelProps = {
  bookId: string;
  pageSize: string | null;
  fontSize: number | null;
  currentHtmlUrl: string | null;
  currentStatus: string | null;
  latestProcessingError?: string | null;
  pageCount: number | null;
  processing: BookProcessingState;
  hasUploadedManuscript: boolean;
  forceReprocessing: boolean;
  canRetryProcessing?: boolean;
  isRetryingProcessing?: boolean;
  retryProcessingError?: string | null;
  onRetryProcessing?: () => void;
  onSettingsReprocessingStart?: () => void;
  onSettingsReprocessingFailed?: () => void;
};

function normalizeStatusToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.toUpperCase() : null;
}

function resolveLocaleTag(locale: string): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-NG";
}

function resolveElapsedSeconds(startedAt: string | null): number | null {
  if (!startedAt) return null;

  const startedAtMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtMs)) return null;

  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

function formatElapsedDuration(startedAt: string | null): string | null {
  const elapsedSeconds = resolveElapsedSeconds(startedAt);
  if (elapsedSeconds === null) return null;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolveProcessingSteps(
  trigger: BookProcessingState["trigger"] | "settings_change_local"
): readonly PreviewProcessingStepKey[] {
  return trigger === "settings_change" || trigger === "settings_change_local"
    ? SETTINGS_REPROCESSING_STEPS
    : PREVIEW_PROCESSING_STEPS;
}

function resolveStepState(
  steps: readonly PreviewProcessingStepKey[],
  activeStep: PreviewProcessingStepKey | null,
  step: PreviewProcessingStepKey
): "completed" | "current" | "upcoming" {
  if (!activeStep) return "upcoming";

  const activeIndex = steps.indexOf(activeStep);
  const stepIndex = steps.indexOf(step);
  if (activeIndex === -1 || stepIndex === -1) return "upcoming";
  if (stepIndex < activeIndex) return "completed";
  if (stepIndex === activeIndex) return "current";
  return "upcoming";
}

function toPreviewProcessingStep(
  step: BookProcessingStep | null
): Exclude<PreviewProcessingStepKey, "SAVING_SETTINGS"> | null {
  if (step === "AI_FORMATTING" || step === "COUNTING_PAGES" || step === "RENDERING_PREVIEW") {
    return step;
  }

  return null;
}

function resolveFallbackProcessingStep(params: {
  forceReprocessing: boolean;
  isAwaitingFreshHtml: boolean;
  isServerCountPending: boolean;
}): Exclude<PreviewProcessingStepKey, "SAVING_SETTINGS"> | null {
  if (params.isAwaitingFreshHtml || params.forceReprocessing) {
    return "AI_FORMATTING";
  }

  if (params.isServerCountPending) {
    return "COUNTING_PAGES";
  }

  return null;
}

function buildPreviewSrcDoc(params: {
  html: string;
  pageSize: BookPageSize;
  fontSize: BookFontSize;
}): string {
  const margins =
    params.pageSize === "A4"
      ? { top: 19, right: 19, bottom: 19, left: 19 }
      : { top: 14, right: 14, bottom: 14, left: 14 };

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <script>",
    "    window.PagedConfig = { auto: true };",
    "  </script>",
    `  <script src="${PagedPolyfillUrl}" defer></script>`,
    "  <style>",
    `    @page { size: ${params.pageSize}; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }`,
    "    * { box-sizing: border-box; }",
    "    html, body { width: 100%; min-height: 100%; }",
    "    body {",
    "      margin: 0;",
    "      padding: 24px;",
    '      font-family: "Miller Text", "Times New Roman", serif;',
    `      font-size: ${params.fontSize}pt;`,
    "      line-height: 1.58;",
    "      color: #101828;",
    "      background: linear-gradient(180deg, #efe7dc 0%, #e3d7c5 100%);",
    "      hanging-punctuation: first last;",
    "    }",
    "    main { width: 100%; }",
    "    .pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 24px; }",
    "    .pagedjs_page { background: #ffffff; box-shadow: 0 20px 48px rgba(12, 18, 28, 0.18); }",
    "    .pagedjs_pagebox { box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.05); }",
    "    section.book-section + section.book-section { margin-top: 1.6em; }",
    "    p, li, blockquote { margin: 0 0 0.8em 0; }",
    "    p { text-align: justify; hyphens: auto; orphans: 3; widows: 3; }",
    "    p + p { text-indent: 1.2em; margin-top: 0; }",
    "    h1, h2, h3, h4 { line-height: 1.22; break-after: avoid; }",
    "    h1 { margin: 2.4em 0 0.85em 0; font-size: 1.8em; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; }",
    "    h1:first-child { margin-top: 0; }",
    "    h2 { margin: 1.7em 0 0.65em 0; font-size: 1.24em; font-weight: 600; letter-spacing: 0.04em; }",
    "    h3, h4 { margin: 1.35em 0 0.5em 0; font-size: 1.05em; font-weight: 600; }",
    "    h1, .book-major-heading, h2.book-major-heading { break-before: page; page-break-before: always; break-after: avoid-page; page-break-after: avoid; text-align: center; margin: 0 0 2.6em 0; padding-top: 72px; }",
    "    main > h1:first-child, main > .book-major-heading:first-child, main > .book-section:first-child > h1:first-child, main > .book-section:first-child > .book-major-heading:first-child { break-before: auto; page-break-before: auto; padding-top: 48px; }",
    "    .book-subheading { break-after: avoid-page; page-break-after: avoid; }",
    "    h1 + p, h2 + p, h3 + p, h4 + p, blockquote + p, ul + p, ol + p { text-indent: 0; }",
    "    .book-major-heading + p, .book-major-heading + blockquote, .book-major-heading + ul, .book-major-heading + ol { text-indent: 0; }",
    "    blockquote { margin: 1.4em 0; padding: 0.15em 0 0.15em 1.2em; border-left: 2px solid rgba(12, 18, 28, 0.22); color: #344054; font-style: italic; }",
    "    ul, ol { margin: 0 0 1em 1.2em; padding-left: 1.2em; }",
    "    li + li { margin-top: 0.32em; }",
    "    hr { border: 0; border-top: 1px solid rgba(15, 23, 42, 0.12); margin: 1.8em 0; }",
    "    img { max-width: 100%; height: auto; }",
    "    a { color: #0f172a; text-decoration: underline; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    params.html,
    "  </main>",
    "  <script>",
    "    document.addEventListener('DOMContentLoaded', function () {",
    "      const finalize = function () { document.body.dataset.previewReady = 'true'; };",
    "      if (window.PagedPolyfill && typeof window.PagedPolyfill.preview === 'function') {",
    "        Promise.resolve(window.PagedPolyfill.preview()).catch(function () { return undefined; }).finally(finalize);",
    "        return;",
    "      }",
    "      finalize();",
    "    });",
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function ManuscriptPreviewPanel({
  bookId,
  pageSize,
  fontSize,
  currentHtmlUrl,
  currentStatus,
  latestProcessingError = null,
  pageCount,
  processing,
  hasUploadedManuscript,
  forceReprocessing,
  canRetryProcessing = false,
  isRetryingProcessing = false,
  retryProcessingError = null,
  onRetryProcessing,
  onSettingsReprocessingStart,
  onSettingsReprocessingFailed,
}: ManuscriptPreviewPanelProps) {
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const normalizedPageSize = normalizeBookPageSize(pageSize);
  const normalizedFontSize = normalizeBookFontSize(fontSize);
  const normalizedBookStatus = normalizeStatusToken(currentStatus);

  const [committedPageSize, setCommittedPageSize] = useState<BookPageSize | null>(
    normalizedPageSize
  );
  const [committedFontSize, setCommittedFontSize] = useState<BookFontSize | null>(
    normalizedFontSize
  );
  const [selectedPageSize, setSelectedPageSize] = useState<BookPageSize | null>(normalizedPageSize);
  const [selectedFontSize, setSelectedFontSize] = useState<BookFontSize | null>(normalizedFontSize);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [processingDots, setProcessingDots] = useState(1);
  const [processingMessageIndex, setProcessingMessageIndex] = useState(0);
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [settingsSaveStartedAt, setSettingsSaveStartedAt] = useState<string | null>(null);
  const [localReprocessingStartedAt, setLocalReprocessingStartedAt] = useState<string | null>(() =>
    forceReprocessing ? new Date().toISOString() : null
  );
  const previousProcessingVisibleRef = useRef(false);

  useEffect(() => {
    setCommittedPageSize(normalizedPageSize);
    setCommittedFontSize(normalizedFontSize);
    setSelectedPageSize(normalizedPageSize);
    setSelectedFontSize(normalizedFontSize);
    setSettingsError(null);
  }, [normalizedFontSize, normalizedPageSize]);

  useEffect(() => {
    const isActive = isSavingSettings || forceReprocessing;
    if (!isActive) {
      setProcessingDots(1);
      return;
    }

    const timer = window.setInterval(() => {
      setProcessingDots((current) => (current >= 3 ? 1 : current + 1));
    }, 420);

    return () => window.clearInterval(timer);
  }, [forceReprocessing, isSavingSettings]);

  useEffect(() => {
    if (!isSavingSettings) {
      setSettingsSaveStartedAt(null);
      return;
    }

    setSettingsSaveStartedAt((current) => current ?? new Date().toISOString());
  }, [isSavingSettings]);

  useEffect(() => {
    if (!forceReprocessing) {
      setLocalReprocessingStartedAt(null);
      return;
    }

    setLocalReprocessingStartedAt((current) => current ?? new Date().toISOString());
  }, [forceReprocessing]);

  useEffect(() => {
    if (!currentHtmlUrl) {
      setPreviewHtml(null);
      setPreviewError(null);
      setIsLoadingPreview(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setIsLoadingPreview(true);
    setPreviewError(null);

    fetch(currentHtmlUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(tDashboard("book_progress_browser_preview_error"));
        }

        const html = await response.text();
        if (cancelled) return;
        setPreviewHtml(sanitizeBookPreviewHtml(html));
      })
      .catch((error) => {
        const errorName =
          typeof error === "object" && error !== null && "name" in error
            ? String((error as { name?: unknown }).name)
            : "";
        if (cancelled || errorName.toLowerCase().includes("abort")) {
          return;
        }

        setPreviewHtml(null);
        setPreviewError(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : tDashboard("book_progress_browser_preview_error")
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentHtmlUrl, tDashboard]);

  useEffect(() => {
    if (
      !selectedPageSize ||
      !selectedFontSize ||
      !committedPageSize ||
      !committedFontSize ||
      SETTINGS_LOCKED_STATUSES.has(normalizedBookStatus ?? "")
    ) {
      return;
    }

    if (selectedPageSize === committedPageSize && selectedFontSize === committedFontSize) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsSavingSettings(true);
      setSettingsError(null);

      updateBookSettings({
        bookId,
        pageSize: selectedPageSize,
        fontSize: selectedFontSize,
      })
        .then((response) => {
          if (cancelled) return;
          setCommittedPageSize(response.pageSize);
          setCommittedFontSize(response.fontSize);
          onSettingsReprocessingStart?.();
        })
        .catch((error) => {
          if (cancelled) return;
          setSettingsError(
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : tDashboard("book_progress_browser_preview_settings_error")
          );
          setSelectedPageSize(committedPageSize);
          setSelectedFontSize(committedFontSize);
          onSettingsReprocessingFailed?.();
        })
        .finally(() => {
          if (!cancelled) {
            setIsSavingSettings(false);
          }
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    bookId,
    committedFontSize,
    committedPageSize,
    normalizedBookStatus,
    onSettingsReprocessingFailed,
    onSettingsReprocessingStart,
    selectedFontSize,
    selectedPageSize,
    tDashboard,
  ]);

  const previewPageSize = normalizedPageSize ?? committedPageSize ?? selectedPageSize;
  const previewFontSize = normalizedFontSize ?? committedFontSize ?? selectedFontSize;
  const previewSrcDoc =
    previewHtml && previewPageSize && previewFontSize
      ? buildPreviewSrcDoc({
          html: previewHtml,
          pageSize: previewPageSize,
          fontSize: previewFontSize,
        })
      : null;
  const isSettingsLocked =
    SETTINGS_LOCKED_STATUSES.has(normalizedBookStatus ?? "") ||
    isSavingSettings ||
    forceReprocessing;
  const hasFormattingFailure =
    hasUploadedManuscript &&
    !forceReprocessing &&
    !isSavingSettings &&
    !processing.isActive &&
    !currentHtmlUrl &&
    normalizedBookStatus === "FORMATTING_REVIEW";
  const isServerCountPending =
    !hasFormattingFailure &&
    typeof pageCount !== "number" &&
    Boolean(currentHtmlUrl) &&
    (forceReprocessing ||
      processing.isActive ||
      normalizedBookStatus === "FORMATTED" ||
      normalizedBookStatus === "DESIGNED");
  const isAwaitingFreshHtml =
    !hasFormattingFailure &&
    hasUploadedManuscript &&
    !currentHtmlUrl &&
    (forceReprocessing ||
      processing.isActive ||
      normalizedBookStatus === "AI_PROCESSING" ||
      normalizedBookStatus === "FORMATTING" ||
      normalizedBookStatus === "FORMATTED");
  const previewProcessingStep = toPreviewProcessingStep(processing.currentStep);
  const fallbackProcessingStep = resolveFallbackProcessingStep({
    forceReprocessing,
    isAwaitingFreshHtml,
    isServerCountPending,
  });
  const isPreviewPipelineActive = processing.isActive && previewProcessingStep !== null;
  const showReprocessingState =
    isSavingSettings || forceReprocessing || isAwaitingFreshHtml || isPreviewPipelineActive;
  const formattedPageCount =
    typeof pageCount === "number"
      ? new Intl.NumberFormat(resolveLocaleTag(locale)).format(pageCount)
      : null;
  const resolvedProcessingStep: PreviewProcessingStepKey | null = isSavingSettings
    ? "SAVING_SETTINGS"
    : (previewProcessingStep ?? fallbackProcessingStep);
  const processingTrigger = isSavingSettings
    ? "settings_change_local"
    : (processing.trigger ?? (forceReprocessing ? "settings_change" : "upload"));
  const isSettingsRerun =
    processingTrigger === "settings_change" || processingTrigger === "settings_change_local";
  const processingSteps = resolveProcessingSteps(processingTrigger);
  const processingTitle = isSettingsRerun
    ? tDashboard("book_progress_browser_preview_reprocessing")
    : tDashboard("book_progress_browser_preview_processing");
  const processingNote = isSettingsRerun
    ? tDashboard("book_progress_browser_preview_reprocessing_note")
    : tDashboard("book_progress_browser_preview_processing_note");
  const processingLabel = `${processingTitle}${".".repeat(processingDots)}`;
  const processingStepLabels = useMemo(
    () => ({
      SAVING_SETTINGS: tDashboard("book_progress_browser_preview_step_saving_settings"),
      AI_FORMATTING: tDashboard("book_progress_browser_preview_step_ai_formatting"),
      COUNTING_PAGES: tDashboard("book_progress_browser_preview_step_counting_pages"),
      RENDERING_PREVIEW: tDashboard("book_progress_browser_preview_step_rendering_preview"),
    }),
    [tDashboard]
  );
  const processingMessages = useMemo(() => {
    const byStep: Record<PreviewProcessingStepKey, string[]> = {
      SAVING_SETTINGS: [
        tDashboard("book_progress_browser_preview_saving_settings_message_primary"),
        tDashboard("book_progress_browser_preview_saving_settings_message_secondary"),
      ],
      AI_FORMATTING: [
        tDashboard("book_progress_browser_preview_ai_formatting_message_primary"),
        tDashboard("book_progress_browser_preview_ai_formatting_message_secondary"),
      ],
      COUNTING_PAGES: [
        tDashboard("book_progress_browser_preview_counting_pages_message_primary"),
        tDashboard("book_progress_browser_preview_counting_pages_message_secondary"),
      ],
      RENDERING_PREVIEW: [
        tDashboard("book_progress_browser_preview_rendering_preview_message_primary"),
        tDashboard("book_progress_browser_preview_rendering_preview_message_secondary"),
      ],
    };

    return resolvedProcessingStep ? (byStep[resolvedProcessingStep] ?? []) : [];
  }, [resolvedProcessingStep, tDashboard]);
  const currentProcessingMessage =
    processingMessages.length > 0
      ? processingMessages[processingMessageIndex % processingMessages.length]
      : null;
  const processingStartedAt = isSavingSettings
    ? settingsSaveStartedAt
    : forceReprocessing
      ? localReprocessingStartedAt
      : processing.startedAt;
  const elapsedSeconds = resolveElapsedSeconds(processingStartedAt);
  const elapsedLabel = formatElapsedDuration(processingStartedAt);
  const showDelayedNotice =
    showReprocessingState &&
    !isSavingSettings &&
    !forceReprocessing &&
    (processingStartedAt === null || (elapsedSeconds !== null && elapsedSeconds >= 90));
  const processingJobStatus = isSavingSettings
    ? "processing"
    : (processing.jobStatus ?? (showReprocessingState ? "processing" : null));
  const processingStatusLabel =
    processingJobStatus === "queued"
      ? tDashboard("book_progress_browser_preview_status_queued")
      : tDashboard("book_progress_browser_preview_status_processing");
  const processingAttemptLabel =
    processing.attempt && processing.maxAttempts
      ? tDashboard("book_progress_browser_preview_attempt", {
          attempt: processing.attempt,
          maxAttempts: processing.maxAttempts,
        })
      : null;
  const currentStepIndex =
    resolvedProcessingStep !== null ? processingSteps.indexOf(resolvedProcessingStep) : -1;
  const processingProgressPercent =
    currentStepIndex >= 0 ? ((currentStepIndex + 1) / processingSteps.length) * 100 : 0;

  useEffect(() => {
    if (!showReprocessingState || processingMessages.length <= 1) {
      setProcessingMessageIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setProcessingMessageIndex((current) => (current + 1) % processingMessages.length);
    }, 2200);

    return () => window.clearInterval(timer);
  }, [processingMessages, showReprocessingState]);

  useEffect(() => {
    if (!showReprocessingState) return;

    const timer = window.setInterval(() => {
      setElapsedNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [showReprocessingState]);

  useEffect(() => {
    if (!showReprocessingState) return;
    setElapsedNow(Date.now());
  }, [showReprocessingState]);

  useEffect(() => {
    const previewReady =
      hasUploadedManuscript && Boolean(currentHtmlUrl) && typeof pageCount === "number";

    if (!showReprocessingState && previousProcessingVisibleRef.current && previewReady) {
      toast.success(tDashboard("book_progress_browser_preview_ready_toast"));
    }

    previousProcessingVisibleRef.current = showReprocessingState;
  }, [currentHtmlUrl, hasUploadedManuscript, pageCount, showReprocessingState, tDashboard]);

  void elapsedNow;

  return (
    <section className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-5">
      <div className="space-y-1.5">
        <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
          {tDashboard("book_progress_browser_preview_title")}
        </p>
        <h2 className="font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
          {tDashboard("book_progress_browser_preview_heading")}
        </h2>
        <p className="font-sans text-sm text-[#d0d0d0]">
          {tDashboard("book_progress_browser_preview_subtitle")}
        </p>
      </div>

      <div className="mt-4 space-y-5">
        <div className="space-y-3">
          <div>
            <p className="font-sans text-sm font-semibold text-white">
              {tDashboard("book_progress_browser_preview_settings_title")}
            </p>
            <p className="font-sans text-xs text-[#a9a9a9]">
              {isSettingsLocked
                ? tDashboard("book_progress_browser_preview_settings_locked")
                : tDashboard("book_progress_browser_preview_settings_hint")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                {
                  value: "A4" as const,
                  title: tDashboard("manuscript_upload_book_size_a4"),
                  description: tDashboard("manuscript_upload_book_size_a4_desc"),
                },
                {
                  value: "A5" as const,
                  title: tDashboard("manuscript_upload_book_size_a5"),
                  description: tDashboard("manuscript_upload_book_size_a5_desc"),
                },
              ] as const
            ).map((option) => {
              const selected = selectedPageSize === option.value;

              return (
                <motion.button
                  key={option.value}
                  type="button"
                  disabled={isSettingsLocked}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                    selected
                      ? "border-[#007eff] bg-[#0d1826]"
                      : "border-[#2A2A2A] bg-[#080808] hover:border-[#007eff]/65",
                    isSettingsLocked ? "cursor-not-allowed opacity-60" : null
                  )}
                  whileTap={prefersReducedMotion || isSettingsLocked ? undefined : { scale: 0.995 }}
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          scale: selected ? 1.02 : 1,
                        }
                  }
                  transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.65 }}
                  onClick={() => {
                    if (isSettingsLocked) return;
                    setSelectedPageSize(option.value);
                    setSettingsError(null);
                  }}
                  aria-pressed={selected}
                >
                  <span className="font-display block text-xl font-semibold text-white">
                    {option.title}
                  </span>
                  <span className="font-sans mt-1 block text-sm text-[#c4c4c4]">
                    {option.description}
                  </span>
                </motion.button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {FONT_SIZE_OPTIONS.map((fontSizeOption) => {
              const selected = selectedFontSize === fontSizeOption;

              return (
                <motion.button
                  key={fontSizeOption}
                  type="button"
                  disabled={isSettingsLocked}
                  className={cn(
                    "font-sans min-h-11 min-w-11 rounded-full border px-4 text-sm font-semibold",
                    selected
                      ? "border-[#007eff] bg-[#007eff]/12 text-white"
                      : "border-[#2A2A2A] bg-[#050505] text-[#dedede] hover:border-[#007eff]/65",
                    isSettingsLocked ? "cursor-not-allowed opacity-60" : null
                  )}
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          scale: selected ? 1.04 : 1,
                        }
                  }
                  transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.6 }}
                  onClick={() => {
                    if (isSettingsLocked) return;
                    setSelectedFontSize(fontSizeOption);
                    setSettingsError(null);
                  }}
                  aria-pressed={selected}
                >
                  {tDashboard("manuscript_upload_font_size_value", { size: fontSizeOption })}
                </motion.button>
              );
            })}
          </div>
        </div>

        {settingsError ? (
          <p
            role="alert"
            className="font-sans rounded-xl border border-[#ef4444]/45 bg-[#111111] px-3 py-2 text-sm text-[#f3b2b2]"
          >
            {settingsError}
          </p>
        ) : null}

        {showReprocessingState ? (
          <div
            aria-live="polite"
            className="rounded-xl border border-[#007eff]/35 bg-[#0a1422] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-sans text-sm font-semibold text-[#d7e8ff]">{processingLabel}</p>
              <span className="font-sans rounded-full border border-[#007eff]/40 bg-[#08111d] px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] text-[#d7e8ff] uppercase">
                {processingStatusLabel}
              </span>
              {elapsedLabel ? (
                <span className="font-sans rounded-full border border-[#1d344f] bg-[#08111d] px-2.5 py-1 text-[11px] text-[#9fbce0]">
                  {tDashboard("book_progress_browser_preview_elapsed", {
                    duration: elapsedLabel,
                  })}
                </span>
              ) : null}
              {processingAttemptLabel ? (
                <span className="font-sans rounded-full border border-[#1d344f] bg-[#08111d] px-2.5 py-1 text-[11px] text-[#9fbce0]">
                  {processingAttemptLabel}
                </span>
              ) : null}
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#102033]">
              <motion.div
                className="h-full rounded-full bg-[#007eff]"
                initial={false}
                animate={{ width: `${processingProgressPercent}%` }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 180, damping: 26, mass: 0.7 }
                }
              />
            </div>

            <div className="mt-4 space-y-1">
              {processingSteps.map((step, index) => {
                const stepState = resolveStepState(processingSteps, resolvedProcessingStep, step);
                const isLast = index === processingSteps.length - 1;

                return (
                  <div key={step} className="grid grid-cols-[1.5rem_1fr] gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "font-sans flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                          stepState === "completed"
                            ? "border-[#007eff] bg-[#007eff] text-white"
                            : stepState === "current"
                              ? "border-[#007eff] bg-[#0f2135] text-[#d7e8ff]"
                              : "border-[#26425e] bg-[#08111d] text-[#7d97b1]"
                        )}
                      >
                        {stepState === "completed" ? "✓" : index + 1}
                      </span>
                      {!isLast ? (
                        <span
                          className={cn(
                            "mt-1 h-6 w-px rounded-full",
                            stepState === "completed" || stepState === "current"
                              ? "bg-[#007eff]/50"
                              : "bg-[#233547]"
                          )}
                        />
                      ) : null}
                    </div>

                    <div className="pt-0.5 pb-3">
                      <p
                        className={cn(
                          "font-sans text-sm font-semibold",
                          stepState === "current"
                            ? "text-white"
                            : stepState === "completed"
                              ? "text-[#d7e8ff]"
                              : "text-[#8aa2bb]"
                        )}
                      >
                        {processingStepLabels[step]}
                      </p>
                      <p
                        className={cn(
                          "font-sans mt-1 text-xs",
                          stepState === "current" ? "text-[#9fbce0]" : "text-[#6f8397]"
                        )}
                      >
                        {stepState === "current"
                          ? (currentProcessingMessage ??
                            tDashboard("book_progress_browser_preview_step_upcoming"))
                          : stepState === "completed"
                            ? tDashboard("book_progress_browser_preview_step_complete")
                            : tDashboard("book_progress_browser_preview_step_upcoming")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="font-sans mt-2 text-xs text-[#9fbce0]">{processingNote}</p>
            {showDelayedNotice ? (
              <div className="mt-2 space-y-2">
                <p className="font-sans text-xs text-[#f4d58f]">
                  {tDashboard("book_progress_browser_preview_delayed_notice")}
                </p>
                {canRetryProcessing && onRetryProcessing ? (
                  <button
                    type="button"
                    onClick={onRetryProcessing}
                    disabled={isRetryingProcessing}
                    className={cn(
                      "font-sans inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-xs font-semibold transition-colors duration-150",
                      isRetryingProcessing
                        ? "cursor-not-allowed border-[#26425e] bg-[#08111d] text-[#7d97b1]"
                        : "border-[#007eff]/55 bg-[#0d1826] text-white hover:border-[#007eff] hover:bg-[#11243d]"
                    )}
                  >
                    {isRetryingProcessing
                      ? tDashboard("book_progress_browser_preview_retry_loading")
                      : tDashboard("book_progress_browser_preview_retry_cta")}
                  </button>
                ) : null}
                {retryProcessingError ? (
                  <p
                    role="alert"
                    className="font-sans rounded-xl border border-[#ef4444]/35 bg-[#1a0f11] px-3 py-2 text-xs text-[#f3b2b2]"
                  >
                    {retryProcessingError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="font-sans mt-2 text-xs text-[#7fa6d2]">
              {tDashboard("book_progress_browser_preview_background_notice")}
            </p>
          </div>
        ) : hasFormattingFailure ? (
          <div className="rounded-xl border border-[#ef4444]/40 bg-[#1a0f11] p-4">
            <p className="font-sans text-sm font-semibold text-[#f3b2b2]">
              {tDashboard("book_progress_browser_preview_failed_title")}
            </p>
            <p className="font-sans mt-1 text-xs text-[#f5c4c4]">
              {tDashboard("book_progress_browser_preview_failed_body")}
            </p>
            {latestProcessingError ? (
              <p
                role="alert"
                className="font-sans mt-3 rounded-xl border border-[#ef4444]/35 bg-[#111111] px-3 py-2 text-xs text-[#f3b2b2]"
              >
                {latestProcessingError}
              </p>
            ) : null}
            {canRetryProcessing && onRetryProcessing ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onRetryProcessing}
                  disabled={isRetryingProcessing}
                  className={cn(
                    "font-sans inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-xs font-semibold transition-colors duration-150",
                    isRetryingProcessing
                      ? "cursor-not-allowed border-[#5c2a31] bg-[#241316] text-[#b88a90]"
                      : "border-[#ef4444]/45 bg-[#2a1111] text-white hover:border-[#ef4444] hover:bg-[#341416]"
                  )}
                >
                  {isRetryingProcessing
                    ? tDashboard("book_progress_browser_preview_retry_loading")
                    : tDashboard("book_progress_browser_preview_retry_cta")}
                </button>
              </div>
            ) : null}
            {retryProcessingError ? (
              <p
                role="alert"
                className="font-sans mt-3 rounded-xl border border-[#ef4444]/35 bg-[#111111] px-3 py-2 text-xs text-[#f3b2b2]"
              >
                {retryProcessingError}
              </p>
            ) : null}
          </div>
        ) : isServerCountPending ? (
          <div className="rounded-xl border border-[#007eff]/35 bg-[#0a1422] px-3 py-3">
            <p className="font-sans text-sm text-[#d7e8ff]">
              {tDashboard("book_progress_browser_preview_count_pending")}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-3">
            <p className="font-sans text-sm text-[#d0d0d0]">
              {tDashboard("book_progress_browser_preview_note")}
            </p>
            {formattedPageCount ? (
              <p className="font-sans mt-1 text-xs text-[#8f8f8f]">
                {tDashboard("book_progress_browser_preview_latest_count", {
                  count: formattedPageCount,
                })}
              </p>
            ) : null}
          </div>
        )}

        <div className="overflow-hidden rounded-[28px] border border-[#2A2A2A] bg-[#080808]">
          {!hasUploadedManuscript ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#050505]">
                <FileText className="size-6 text-[#007eff]" aria-hidden="true" />
              </div>
              <p className="font-display text-2xl font-semibold tracking-tight text-white">
                {tDashboard("book_progress_browser_preview_empty_title")}
              </p>
              <p className="font-sans max-w-lg text-sm text-[#cfcfcf]">
                {tDashboard("book_progress_browser_preview_empty_body")}
              </p>
            </div>
          ) : showReprocessingState ? (
            <div className="min-h-[420px] space-y-4 px-4 py-6">
              <div className="mx-auto h-6 w-40 animate-pulse rounded bg-[#1f1f1f]" />
              <div className="mx-auto h-[360px] w-full max-w-[720px] animate-pulse rounded-[24px] bg-[#151515]" />
            </div>
          ) : isLoadingPreview ? (
            <div className="min-h-[420px] space-y-4 px-4 py-6">
              <div className="mx-auto h-6 w-32 animate-pulse rounded bg-[#1f1f1f]" />
              <div className="mx-auto h-[360px] w-full max-w-[720px] animate-pulse rounded-[24px] bg-[#151515]" />
            </div>
          ) : hasFormattingFailure ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-[#4b2428] bg-[#180d10]">
                <FileText className="size-6 text-[#ef4444]" aria-hidden="true" />
              </div>
              <p className="font-sans max-w-lg text-sm text-[#dcb7bb]">
                {tDashboard("book_progress_browser_preview_unavailable")}
              </p>
            </div>
          ) : previewError ? (
            <div className="flex min-h-[320px] items-center justify-center px-6 py-10">
              <p
                role="alert"
                className="font-sans rounded-xl border border-[#ef4444]/45 bg-[#111111] px-4 py-3 text-sm text-[#f3b2b2]"
              >
                {previewError}
              </p>
            </div>
          ) : previewSrcDoc ? (
            <iframe
              title={tDashboard("book_progress_browser_preview_frame_title")}
              className="h-[540px] w-full border-0 bg-[#e6dccd] md:h-[720px]"
              sandbox="allow-scripts"
              srcDoc={previewSrcDoc}
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center px-6 py-10 text-center">
              <p className="font-sans max-w-lg text-sm text-[#cfcfcf]">
                {tDashboard("book_progress_browser_preview_unavailable")}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
