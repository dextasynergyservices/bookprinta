"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Check, FileText, Layers, Palette, Sparkles, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { KeyboardEvent } from "react";
import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  type BookSize,
  isPricingConfigurationComplete,
  type Lamination,
  type PaperColor,
  usePricingStore,
} from "@/stores/pricing-store";

type BinaryChoice = "yes" | "no";

type GroupOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  swatchColor?: string;
  swatchBorder?: string;
};

interface OptionGroupProps<T extends string> {
  id: string;
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options: GroupOption<T>[];
  columns?: 2 | 3;
  icon: LucideIcon;
}

interface ConfigurationModalProps {
  open: boolean;
  packageName?: string | null;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

const SPRING_TRANSITION = { type: "spring", stiffness: 430, damping: 34, mass: 0.65 } as const;

function toBinaryChoice(value: boolean | null): BinaryChoice | null {
  if (value === null) return null;
  return value ? "yes" : "no";
}

function OptionGroup<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  columns = 2,
  icon: Icon,
}: OptionGroupProps<T>) {
  const selectedIndex = options.findIndex((option) => option.value === value);

  const handleArrowNavigation = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const isHorizontal = event.key === "ArrowRight" || event.key === "ArrowLeft";
    const isVertical = event.key === "ArrowUp" || event.key === "ArrowDown";

    if (!isHorizontal && !isVertical) return;

    event.preventDefault();
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (index + delta + options.length) % options.length;
    onChange(options[nextIndex].value);
    const nextOption = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `[data-option-index="${nextIndex}"]`
    );
    nextOption?.focus();
  };

  return (
    <fieldset className="space-y-2.5">
      <legend id={`${id}-legend`} className="font-sans text-sm font-semibold text-white/90">
        <span className="inline-flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full border border-[#2A2A2A] bg-black/70 text-[#007eff]">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <span>{label}</span>
        </span>
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-legend`}
        className={cn(
          "grid gap-2 rounded-[1.45rem] border border-[#2A2A2A] bg-black p-2",
          columns === 2 ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {options.map((option, index) => {
          const isSelected = value === option.value;
          const tabIndex = isSelected || (selectedIndex === -1 && index === 0) ? 0 : -1;

          return (
            <motion.button
              key={option.value}
              type="button"
              data-option-index={index}
              role="radio"
              aria-checked={isSelected}
              aria-label={option.label}
              tabIndex={tabIndex}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleArrowNavigation(event, index)}
              layout
              transition={SPRING_TRANSITION}
              animate={{ scale: isSelected ? 1 : 0.985 }}
              className={cn(
                "relative flex min-h-11 min-w-11 items-center justify-center gap-2 overflow-hidden rounded-[1rem] border px-3 py-3 text-center font-sans text-sm font-semibold transition-[color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                isSelected
                  ? "border-[#007eff] text-white shadow-[0_10px_28px_rgba(0,126,255,0.35)]"
                  : "border-[#2A2A2A] bg-black text-white/85 hover:border-[#007eff] hover:bg-[#0a0a0a]"
              )}
            >
              {isSelected && (
                <motion.span
                  layoutId={`${id}-selection`}
                  className="absolute inset-0 rounded-2xl bg-[#007eff]"
                  transition={SPRING_TRANSITION}
                  aria-hidden="true"
                />
              )}
              {isSelected && (
                <span className="absolute top-1.5 right-1.5 z-10 flex size-4.5 items-center justify-center rounded-full bg-white/20">
                  <Check className="size-3 text-white" aria-hidden="true" />
                </span>
              )}

              <span className="relative z-10 flex flex-col items-center">
                <span className="flex items-center gap-2">
                  {option.swatchColor && (
                    <span
                      className="size-5 rounded-full border"
                      style={{
                        backgroundColor: option.swatchColor,
                        borderColor: option.swatchBorder ?? "#2A2A2A",
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <span>{option.label}</span>
                </span>

                {option.description && (
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px] leading-tight",
                      isSelected ? "text-white/85" : "text-white/55"
                    )}
                  >
                    {option.description}
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ConfigurationModal({
  open,
  packageName,
  onOpenChange,
  onContinue,
}: ConfigurationModalProps) {
  const t = useTranslations("checkout");
  const isMobile = useIsMobile();

  const {
    hasCoverDesign,
    hasFormatting,
    bookSize,
    paperColor,
    lamination,
    setHasCoverDesign,
    setHasFormatting,
    setBookSize,
    setPaperColor,
    setLamination,
  } = usePricingStore();

  const isComplete = isPricingConfigurationComplete({
    hasCoverDesign,
    hasFormatting,
    bookSize,
    paperColor,
    lamination,
  });
  const completedCount = [hasCoverDesign, hasFormatting, bookSize, paperColor, lamination].filter(
    (value) => value !== null
  ).length;
  const progressPercent = (completedCount / 5) * 100;
  const canContinue = isComplete && Boolean(packageName);

  const binaryOptions = useMemo<GroupOption<BinaryChoice>[]>(
    () => [
      { value: "yes", label: t("configuration_yes") },
      { value: "no", label: t("configuration_no") },
    ],
    [t]
  );

  const bookSizeOptions = useMemo<GroupOption<BookSize>[]>(
    () => [
      { value: "A4", label: t("configuration_book_size_a4") },
      { value: "A5", label: t("configuration_book_size_a5") },
      { value: "A6", label: t("configuration_book_size_a6") },
    ],
    [t]
  );

  const paperColorOptions = useMemo<GroupOption<PaperColor>[]>(
    () => [
      {
        value: "white",
        label: t("configuration_paper_white"),
        swatchColor: "#ffffff",
        swatchBorder: "#2A2A2A",
      },
      {
        value: "cream",
        label: t("configuration_paper_cream"),
        swatchColor: "#f2ead7",
        swatchBorder: "#d9cdb6",
      },
    ],
    [t]
  );

  const laminationOptions = useMemo<GroupOption<Lamination>[]>(
    () => [
      {
        value: "matt",
        label: t("configuration_lamination_matt"),
        description: t("configuration_lamination_matt_desc"),
      },
      {
        value: "gloss",
        label: t("configuration_lamination_gloss"),
        description: t("configuration_lamination_gloss_desc"),
      },
    ],
    [t]
  );

  const modalMotion = isMobile
    ? {
        initial: { y: "100%" as const, opacity: 1 },
        animate: { y: "0%", opacity: 1 },
        exit: { y: "100%", opacity: 1 },
      }
    : {
        initial: { y: 18, opacity: 0, scale: 0.96 },
        animate: { y: 0, opacity: 1, scale: 1 },
        exit: { y: 14, opacity: 0, scale: 0.98 },
      };

  const handleContinue = () => {
    if (!canContinue) return;
    onContinue();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                {...modalMotion}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "z-50 flex flex-col overflow-hidden bg-black text-white outline-none",
                  isMobile
                    ? "fixed inset-0 h-dvh w-full px-5 pb-5 pt-4"
                    : "fixed top-1/2 left-1/2 h-[min(88dvh,900px)] w-[min(860px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[34px] border border-[#2A2A2A] px-8 pb-8 pt-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
                )}
              >
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  <div className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[#007eff]/20 blur-3xl" />
                  <div className="absolute right-[-3.5rem] bottom-[-4rem] size-52 rounded-full bg-white/10 blur-3xl" />
                </div>

                <div className="relative z-10 flex h-full flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <DialogPrimitive.Title className="font-display text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
                        {t("configuration_title")}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="mt-2 font-sans text-sm text-white/65">
                        {t("configuration_subtitle")}
                      </DialogPrimitive.Description>
                      {packageName && (
                        <p className="mt-2 font-sans text-xs font-medium text-white/45 uppercase tracking-[0.14em]">
                          {t("configuration_package", { packageName })}
                        </p>
                      )}
                    </div>

                    <DialogPrimitive.Close asChild>
                      <button
                        type="button"
                        aria-label={t("configuration_close_aria")}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#2A2A2A] bg-black/65 text-white/85 transition-colors duration-200 hover:border-[#007eff] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      >
                        <XIcon className="size-5" aria-hidden="true" />
                      </button>
                    </DialogPrimitive.Close>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/45 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#007eff]/45 bg-[#007eff]/15 px-3 py-1 font-sans text-[11px] font-semibold tracking-[0.12em] text-[#9fd0ff] uppercase">
                        <Sparkles className="size-3" aria-hidden="true" />
                        {t("configuration_step_badge")}
                      </span>
                      <span className="font-sans text-xs font-medium text-white/70">
                        {t("configuration_progress", { count: completedCount, total: 5 })}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        initial={false}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                        className="h-full rounded-full bg-[#007eff]"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex-1 overflow-y-auto pr-0 pb-4 md:pr-1" data-lenis-prevent>
                    <div className="space-y-4">
                      <motion.div layout transition={SPRING_TRANSITION}>
                        <OptionGroup
                          id="config-cover-design"
                          icon={Palette}
                          label={t("configuration_cover_design")}
                          value={toBinaryChoice(hasCoverDesign)}
                          onChange={(next) => setHasCoverDesign(next === "yes")}
                          options={binaryOptions}
                        />
                      </motion.div>

                      <motion.div layout transition={SPRING_TRANSITION}>
                        <OptionGroup
                          id="config-formatting"
                          icon={FileText}
                          label={t("configuration_formatting")}
                          value={toBinaryChoice(hasFormatting)}
                          onChange={(next) => setHasFormatting(next === "yes")}
                          options={binaryOptions}
                        />
                      </motion.div>

                      <motion.div layout transition={SPRING_TRANSITION}>
                        <OptionGroup
                          id="config-book-size"
                          icon={BookOpen}
                          label={t("configuration_book_size")}
                          value={bookSize}
                          onChange={setBookSize}
                          options={bookSizeOptions}
                          columns={3}
                        />
                      </motion.div>

                      <motion.div layout transition={SPRING_TRANSITION}>
                        <OptionGroup
                          id="config-paper-color"
                          icon={Sparkles}
                          label={t("configuration_paper_color")}
                          value={paperColor}
                          onChange={setPaperColor}
                          options={paperColorOptions}
                        />
                      </motion.div>

                      <motion.div layout transition={SPRING_TRANSITION}>
                        <OptionGroup
                          id="config-lamination"
                          icon={Layers}
                          label={t("configuration_lamination")}
                          value={lamination}
                          onChange={setLamination}
                          options={laminationOptions}
                        />
                      </motion.div>
                    </div>
                  </div>

                  <div className="border-t border-[#2A2A2A] pt-4">
                    <motion.button
                      type="button"
                      onClick={handleContinue}
                      whileTap={canContinue ? { scale: 0.99 } : {}}
                      animate={{ scale: canContinue ? 1 : 0.995 }}
                      transition={SPRING_TRANSITION}
                      disabled={!canContinue}
                      aria-label={t("configuration_continue")}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-center rounded-full px-6 font-display text-sm font-semibold tracking-wide transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                        canContinue
                          ? "bg-linear-to-r from-[#007eff] to-[#2494ff] text-white shadow-[0_14px_30px_rgba(0,126,255,0.35)] hover:brightness-110"
                          : "cursor-not-allowed border border-[#2A2A2A] bg-[#121212] text-white/45"
                      )}
                    >
                      {t("configuration_continue")}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
