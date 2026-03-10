"use client";

import { motion } from "framer-motion";
import { FileUp, UploadCloud } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  type BookFontSize,
  type BookPageSize,
  normalizeBookFontSize,
  normalizeBookPageSize,
  updateBookSettings,
  uploadManuscriptWithProgress,
  validateManuscriptFile,
} from "@/hooks/useManuscriptUpload";
import { cn } from "@/lib/utils";

type ManuscriptUploadStep = "settings" | "upload" | "result";

type ManuscriptUploadFlowProps = {
  bookId: string;
  initialPageSize: string | null;
  initialFontSize: number | null;
  initialEstimatedPages: number | null;
  initialWordCount: number | null;
  onUploadSuccess?: () => void;
};

const FONT_SIZE_OPTIONS: readonly BookFontSize[] = [11, 12, 14] as const;

function resolveInitialStep(
  pageSize: BookPageSize | null,
  fontSize: BookFontSize | null,
  estimatedPages: number | null
): ManuscriptUploadStep {
  if (!pageSize || !fontSize) return "settings";
  if (typeof estimatedPages === "number" && estimatedPages > 0) return "result";
  return "upload";
}

export function ManuscriptUploadFlow({
  bookId,
  initialPageSize,
  initialFontSize,
  initialEstimatedPages,
  initialWordCount,
  onUploadSuccess,
}: ManuscriptUploadFlowProps) {
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedPageSize, setSelectedPageSize] = useState<BookPageSize | null>(
    normalizeBookPageSize(initialPageSize)
  );
  const [selectedFontSize, setSelectedFontSize] = useState<BookFontSize | null>(
    normalizeBookFontSize(initialFontSize)
  );
  const [estimatedPages, setEstimatedPages] = useState<number | null>(initialEstimatedPages);
  const [wordCount, setWordCount] = useState<number | null>(initialWordCount);
  const [step, setStep] = useState<ManuscriptUploadStep>(
    resolveInitialStep(
      normalizeBookPageSize(initialPageSize),
      normalizeBookFontSize(initialFontSize),
      initialEstimatedPages
    )
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [processingDots, setProcessingDots] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasRequiredSettings = Boolean(selectedPageSize && selectedFontSize);
  const isBusy = isSavingSettings || isUploading;

  useEffect(() => {
    const normalizedPageSize = normalizeBookPageSize(initialPageSize);
    const normalizedFontSize = normalizeBookFontSize(initialFontSize);
    setSelectedPageSize(normalizedPageSize);
    setSelectedFontSize(normalizedFontSize);
    setEstimatedPages(initialEstimatedPages);
    setWordCount(initialWordCount);
    setUploadProgress(0);
    setIsSavingSettings(false);
    setIsUploading(false);
    setIsProcessing(false);
    setDragActive(false);
    setProcessingDots(1);
    setErrorMessage(null);
    setStep(resolveInitialStep(normalizedPageSize, normalizedFontSize, initialEstimatedPages));
  }, [initialEstimatedPages, initialFontSize, initialPageSize, initialWordCount]);

  useEffect(() => {
    if (!isProcessing) {
      setProcessingDots(1);
      return;
    }

    const timer = window.setInterval(() => {
      setProcessingDots((current) => (current >= 3 ? 1 : current + 1));
    }, 420);
    return () => window.clearInterval(timer);
  }, [isProcessing]);

  const formattedWordCount = useMemo(() => {
    if (typeof wordCount !== "number") return null;
    return new Intl.NumberFormat(
      locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-NG"
    ).format(wordCount);
  }, [locale, wordCount]);

  const processingLabel = `${tDashboard("manuscript_upload_processing_extracting_word_count")}${".".repeat(processingDots)}`;

  const clearError = () => setErrorMessage(null);

  const handleSettingsSave = async () => {
    clearError();

    if (!selectedPageSize) {
      setErrorMessage(tDashboard("manuscript_upload_error_book_size_required"));
      return;
    }

    if (!selectedFontSize) {
      setErrorMessage(tDashboard("manuscript_upload_error_font_size_required"));
      return;
    }

    setIsSavingSettings(true);
    try {
      const response = await updateBookSettings({
        bookId,
        pageSize: selectedPageSize,
        fontSize: selectedFontSize,
      });

      setSelectedPageSize(response.pageSize);
      setSelectedFontSize(response.fontSize);
      setEstimatedPages(response.estimatedPages);
      setWordCount(response.wordCount);
      setStep("upload");
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : tDashboard("manuscript_upload_error_generic")
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    clearError();

    if (!selectedPageSize || !selectedFontSize) {
      setErrorMessage(tDashboard("manuscript_upload_error_settings_required"));
      setStep("settings");
      return;
    }

    const validation = validateManuscriptFile(file);
    if (validation === "unsupported") {
      setErrorMessage(tDashboard("manuscript_upload_error_file_type"));
      return;
    }
    if (validation === "size") {
      setErrorMessage(tDashboard("manuscript_upload_error_file_size"));
      return;
    }
    if (validation === "empty") {
      setErrorMessage(tDashboard("manuscript_upload_error_file_empty"));
      return;
    }

    setUploadProgress(0);
    setIsUploading(true);
    setIsProcessing(false);
    setStep("upload");

    try {
      const response = await uploadManuscriptWithProgress({
        bookId,
        file,
        onProgress: (percentage) => {
          setUploadProgress(percentage);
          if (percentage >= 100) {
            setIsProcessing(true);
          }
        },
      });

      setSelectedPageSize(response.pageSize);
      setSelectedFontSize(response.fontSize);
      setWordCount(response.wordCount);
      setEstimatedPages(response.estimatedPages);
      setStep("result");
      onUploadSuccess?.();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : tDashboard("manuscript_upload_error_generic");

      setErrorMessage(
        message.toLowerCase().includes("scanning temporarily unavailable")
          ? tDashboard("manuscript_upload_error_scanner_unavailable")
          : message
      );
      setIsProcessing(false);
    } finally {
      setIsUploading(false);
    }
  };

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    await handleFileUpload(file);
  };

  const onDropZoneClick = () => {
    if (!hasRequiredSettings || isBusy) return;
    fileInputRef.current?.click();
  };

  const onDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!hasRequiredSettings || isBusy) return;
    setDragActive(true);
  };

  const onDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setDragActive(false);
  };

  const onDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (!hasRequiredSettings || isBusy) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleFileUpload(file);
  };

  return (
    <section className="w-full rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 md:p-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
          {tDashboard("manuscript_upload_title")}
        </h2>
        <p className="font-sans text-sm text-[#c8c8c8]">
          {tDashboard("manuscript_upload_subtitle")}
        </p>
      </div>

      <ol
        className="mt-4 grid grid-cols-3 gap-2"
        aria-label={tDashboard("manuscript_upload_steps_aria")}
      >
        {(["settings", "upload", "result"] as const).map((item, index) => {
          const active = step === item;
          const completed =
            (item === "settings" && step !== "settings") ||
            (item === "upload" && step === "result");

          return (
            <li
              key={item}
              className={cn(
                "font-sans min-h-11 rounded-xl border px-3 py-2 text-xs font-medium",
                active
                  ? "border-[#007eff] bg-[#007eff]/10 text-white"
                  : completed
                    ? "border-[#007eff]/45 bg-[#0f1a28] text-[#dbeeff]"
                    : "border-[#2A2A2A] bg-[#090909] text-[#909090]"
              )}
            >
              <span className="block text-[11px] uppercase opacity-80">{index + 1}</span>
              <span className="block">
                {item === "settings"
                  ? tDashboard("manuscript_upload_step_settings")
                  : item === "upload"
                    ? tDashboard("manuscript_upload_step_upload")
                    : tDashboard("manuscript_upload_step_result")}
              </span>
            </li>
          );
        })}
      </ol>

      {errorMessage ? (
        <div className="font-sans mt-4 rounded-xl border border-[#ef4444] bg-[#2a1111] px-3 py-3 text-sm text-[#fecaca]">
          {errorMessage}
        </div>
      ) : null}

      {step === "settings" ? (
        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <div>
              <p className="font-sans text-sm font-semibold text-white">
                {tDashboard("manuscript_upload_book_size_label")}
              </p>
              <p className="font-sans text-xs text-[#a9a9a9]">
                {tDashboard("manuscript_upload_book_size_hint")}
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
                    className={cn(
                      "w-full rounded-2xl border px-4 py-4 text-left",
                      selected
                        ? "border-[#007eff] bg-[#0d1826]"
                        : "border-[#2A2A2A] bg-[#080808] hover:border-[#007eff]/65"
                    )}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.995 }}
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : {
                            scale: selected ? 1.02 : 1,
                          }
                    }
                    transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.65 }}
                    onClick={() => {
                      setSelectedPageSize(option.value);
                      clearError();
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
          </div>

          <div className="space-y-2">
            <div>
              <p className="font-sans text-sm font-semibold text-white">
                {tDashboard("manuscript_upload_font_size_label")}
              </p>
              <p className="font-sans text-xs text-[#a9a9a9]">
                {tDashboard("manuscript_upload_font_size_hint")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {FONT_SIZE_OPTIONS.map((fontSizeOption) => {
                const selected = selectedFontSize === fontSizeOption;
                return (
                  <motion.button
                    key={fontSizeOption}
                    type="button"
                    className={cn(
                      "font-sans min-h-11 min-w-11 rounded-full border px-4 text-sm font-semibold",
                      selected
                        ? "border-[#007eff] bg-[#007eff]/12 text-white"
                        : "border-[#2A2A2A] bg-[#050505] text-[#dedede] hover:border-[#007eff]/65"
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
                      setSelectedFontSize(fontSizeOption);
                      clearError();
                    }}
                    aria-pressed={selected}
                  >
                    {tDashboard("manuscript_upload_font_size_value", { size: fontSizeOption })}
                  </motion.button>
                );
              })}
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void handleSettingsSave()}
            disabled={isSavingSettings}
            className="font-sans min-h-11 w-full rounded-full bg-[#007eff] text-sm font-semibold text-white hover:bg-[#0066d1]"
          >
            {isSavingSettings
              ? tDashboard("manuscript_upload_save_settings")
              : tDashboard("manuscript_upload_continue")}
          </Button>
        </div>
      ) : null}

      {step === "upload" ? (
        <div className="mt-4 space-y-4">
          <button
            type="button"
            disabled={!hasRequiredSettings || isBusy}
            onClick={onDropZoneClick}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={(event) => void onDrop(event)}
            aria-label={tDashboard("manuscript_upload_dropzone_aria")}
            className={cn(
              "w-full rounded-2xl border-2 border-dashed px-4 py-8 text-center outline-none transition-colors",
              !hasRequiredSettings
                ? "cursor-not-allowed border-[#393939] bg-[#080808]"
                : dragActive
                  ? "border-[#007eff] bg-[#0b1725]"
                  : "cursor-pointer border-[#4a4a4a] bg-[#090909] hover:border-[#007eff]/75",
              errorMessage ? "border-[#ef4444]" : null
            )}
          >
            <span className="mx-auto flex max-w-sm flex-col items-center gap-3">
              <span className="flex size-14 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#050505]">
                <UploadCloud className="size-7 text-[#007eff]" aria-hidden="true" />
              </span>
              <span className="font-sans text-sm font-semibold text-white">
                {tDashboard("manuscript_upload_dropzone_label")}
              </span>
              <span className="font-sans text-xs text-[#b6b6b6]">
                {tDashboard("manuscript_upload_dropzone_helper")}
              </span>
              <span className="font-sans text-[11px] text-[#8f8f8f]">
                {tDashboard("manuscript_upload_dropzone_formats")}
              </span>
              <span className="font-sans inline-flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#111111] px-4 text-xs font-semibold text-white">
                {tDashboard("manuscript_upload_choose_file")}
              </span>
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => void onFileInputChange(event)}
            className="hidden"
          />

          {isUploading || uploadProgress > 0 ? (
            <div className="space-y-2">
              <div className="font-sans flex items-center justify-between text-xs text-[#c9c9c9]">
                <span>{tDashboard("manuscript_upload_progress_label")}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-[#1b1b1b]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                aria-label={tDashboard("manuscript_upload_progress_label")}
              >
                <motion.div
                  className="h-full bg-[#007eff]"
                  initial={false}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                />
              </div>
            </div>
          ) : null}

          {isProcessing ? (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#0a0a0a] p-4">
              <div className="space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded bg-[#2A2A2A]" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-[#252525]" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-[#202020]" />
              </div>
              <p className="font-sans mt-3 text-sm text-[#d2d2d2]">{processingLabel}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "result" && typeof estimatedPages === "number" ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#2A2A2A] bg-[#0b0b0b] p-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#070707]">
            <FileUp className="size-5 text-[#007eff]" aria-hidden="true" />
          </div>
          <p className="font-display text-5xl font-semibold tracking-tight text-white md:text-6xl">
            {estimatedPages}
          </p>
          <p className="font-sans text-sm text-[#d2d2d2]">
            {tDashboard("manuscript_upload_estimated_pages_label")}
          </p>
          <p className="font-sans mx-auto max-w-xs text-xs text-[#9f9f9f]">
            {tDashboard("manuscript_upload_estimated_pages_helper")}
          </p>
          {formattedWordCount ? (
            <p className="font-sans text-xs text-[#9f9f9f]">
              {tDashboard("manuscript_upload_word_count_label", { count: formattedWordCount })}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("upload")}
            className="font-sans mt-2 min-h-11 w-full rounded-full border-[#2A2A2A] bg-[#000000] text-sm text-white hover:bg-[#131313]"
          >
            {tDashboard("manuscript_upload_replace_file")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
