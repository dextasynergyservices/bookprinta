"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCreateReview, useReviewState } from "@/hooks/use-dashboard-shell-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export type ReviewRequestDialogTarget = {
  bookId: string;
  bookTitle: string | null;
};

type DashboardReviewRequestDialogProps = {
  open: boolean;
  target: ReviewRequestDialogTarget | null;
  onOpenChange: (open: boolean) => void;
  onReviewSubmitted?: (bookId: string) => void;
};

const STAR_COUNT = 5;
const SUCCESS_AUTO_CLOSE_DELAY_MS = 2000;
const MODAL_EASE = [0.22, 1, 0.36, 1] as const;

type ReviewDialogViewState = "form" | "success";

type ReviewRatingStarsProps = {
  rating: number;
  hoveredRating: number | null;
  isDisabled: boolean;
  ariaLabel: string;
  getOptionAriaLabel: (count: number) => string;
  onRatingChange: (value: number) => void;
  onHoverChange: (value: number | null) => void;
};

function ReviewRatingStars({
  rating,
  hoveredRating,
  isDisabled,
  ariaLabel,
  getOptionAriaLabel,
  onRatingChange,
  onHoverChange,
}: ReviewRatingStarsProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeRating = hoveredRating ?? rating;

  const focusStar = (value: number) => {
    buttonRefs.current[value - 1]?.focus();
  };

  const moveRating = (currentValue: number, nextValue: number) => {
    const clampedValue = Math.min(STAR_COUNT, Math.max(1, nextValue));
    if (clampedValue === currentValue) return;
    onRatingChange(clampedValue);
    focusStar(clampedValue);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3"
    >
      {Array.from({ length: STAR_COUNT }, (_, index) => {
        const value = index + 1;
        const isFilled = activeRating >= value;
        const isChecked = rating === value;
        const isFocusable = rating === 0 ? value === 1 : isChecked;

        return (
          <motion.button
            key={value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={isChecked}
            aria-label={getOptionAriaLabel(value)}
            tabIndex={isFocusable ? 0 : -1}
            disabled={isDisabled}
            onClick={() => onRatingChange(value)}
            onFocus={() => onHoverChange(null)}
            onMouseEnter={() => onHoverChange(value)}
            onMouseLeave={() => onHoverChange(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                event.preventDefault();
                moveRating(value, value + 1);
                return;
              }

              if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                event.preventDefault();
                moveRating(value, value - 1);
                return;
              }

              if (event.key === "Home") {
                event.preventDefault();
                onRatingChange(1);
                focusStar(1);
                return;
              }

              if (event.key === "End") {
                event.preventDefault();
                onRatingChange(STAR_COUNT);
                focusStar(STAR_COUNT);
                return;
              }

              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onRatingChange(value);
              }
            }}
            whileHover={isDisabled ? undefined : { scale: 1.08 }}
            whileTap={isDisabled ? undefined : { scale: 0.94 }}
            animate={{
              scale: isChecked ? 1.05 : 1,
            }}
            transition={{ duration: 0.18, ease: MODAL_EASE }}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#050505] text-[#2A2A2A] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
              !isDisabled && "hover:border-[#007eff]",
              isDisabled && "cursor-not-allowed opacity-60"
            )}
          >
            <motion.span
              animate={{
                color: isFilled ? "#007eff" : "#2A2A2A",
              }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <Star
                className={cn("size-8 sm:size-9", isFilled ? "fill-current" : "")}
                aria-hidden="true"
              />
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function DashboardReviewRequestDialog({
  open,
  target,
  onOpenChange,
  onReviewSubmitted,
}: DashboardReviewRequestDialogProps) {
  const tDashboard = useTranslations("dashboard");
  const prefersReducedMotion = useReducedMotion();
  const { books, isLoading } = useReviewState();
  const { submitReview, isPending } = useCreateReview();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [viewState, setViewState] = useState<ReviewDialogViewState>("form");

  useEffect(() => {
    if (!target) {
      setRating(0);
      setHoveredRating(null);
      setComment("");
      setViewState("form");
      return;
    }

    const existingReview = books.find((book) => book.bookId === target.bookId)?.review;
    setRating(existingReview?.rating ?? 0);
    setHoveredRating(null);
    setComment(existingReview?.comment ?? "");
    setViewState("form");
  }, [books, target]);

  useEffect(() => {
    if (!open || viewState !== "success") return;

    const timeoutId = window.setTimeout(() => {
      onOpenChange(false);
    }, SUCCESS_AUTO_CLOSE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onOpenChange, open, viewState]);

  const reviewBook = useMemo(
    () => books.find((book) => book.bookId === target?.bookId) ?? null,
    [books, target?.bookId]
  );
  const pendingBook = reviewBook?.reviewStatus === "PENDING" ? reviewBook : null;
  const existingReview = reviewBook?.review ?? null;
  const isUnavailable = Boolean(target) && !isLoading && !reviewBook;
  const panelTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.3, ease: MODAL_EASE };
  const overlayTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.2, ease: "easeOut" as const };

  const handleSubmit = async () => {
    if (!target) return;

    if (rating < 1 || rating > 5) {
      toast.error(tDashboard("review_dialog_select_rating_error"));
      return;
    }

    try {
      await submitReview({
        bookId: target.bookId,
        rating,
        comment,
      });
      onReviewSubmitted?.(target.bookId);
      setViewState("success");
    } catch {
      toast.error(tDashboard("review_dialog_submit_error"));
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
                className="fixed inset-0 z-50 bg-black/82 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount>
              <motion.section
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 36, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.98 }}
                transition={panelTransition}
                data-lenis-prevent
                className="fixed inset-0 z-50 flex items-end justify-center outline-none sm:inset-6 sm:items-center"
              >
                <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden border border-[#2A2A2A] bg-[#000000] text-white shadow-[0_32px_96px_rgba(0,0,0,0.72)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-[42rem] sm:rounded-[32px]">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(68% 52% at 14% 0%, rgba(0,126,255,0.18) 0%, rgba(0,0,0,0) 74%)",
                    }}
                  />

                  <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      aria-label={tDashboard("review_dialog_close")}
                      className="absolute top-4 right-4 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#0A0A0A] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#111111] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>

                    {viewState === "success" ? (
                      <div className="flex flex-1 flex-col items-center justify-center px-2 pb-10 pt-12 text-center sm:px-6">
                        <motion.div
                          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.82 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={panelTransition}
                          className="relative flex size-24 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10"
                        >
                          {!prefersReducedMotion ? (
                            <motion.span
                              aria-hidden="true"
                              initial={{ opacity: 0.5, scale: 0.88 }}
                              animate={{ opacity: 0, scale: 1.22 }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className="absolute inset-0 rounded-full border border-emerald-400/35"
                            />
                          ) : null}
                          <motion.span
                            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.72 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={panelTransition}
                            className="inline-flex size-14 items-center justify-center rounded-full bg-emerald-500/18 text-emerald-300"
                          >
                            <Check className="size-8" aria-hidden="true" />
                          </motion.span>
                        </motion.div>

                        <motion.div
                          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={panelTransition}
                        >
                          <DialogPrimitive.Title className="font-display mt-8 text-3xl font-semibold tracking-tight text-white">
                            {tDashboard("review_thanks")}
                          </DialogPrimitive.Title>
                        </motion.div>
                        <motion.div
                          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={panelTransition}
                        >
                          <DialogPrimitive.Description className="font-sans mt-3 max-w-sm text-sm leading-6 text-[#BDBDBD]">
                            {tDashboard("review_dialog_subtitle")}
                          </DialogPrimitive.Description>
                        </motion.div>
                      </div>
                    ) : (
                      <>
                        <header className="pr-14 text-left">
                          <p className="font-sans text-[11px] font-semibold tracking-[0.16em] text-[#007eff] uppercase">
                            {tDashboard("review_dialog_book_label")}
                          </p>
                          <DialogPrimitive.Title className="font-display mt-4 text-[2rem] leading-[1.04] font-semibold tracking-tight text-white sm:text-[2.35rem]">
                            {tDashboard("review_dialog_title")}
                          </DialogPrimitive.Title>
                          <DialogPrimitive.Description className="font-sans mt-3 max-w-xl text-sm leading-6 text-[#BDBDBD] sm:text-[0.95rem]">
                            {tDashboard("review_dialog_subtitle")}
                          </DialogPrimitive.Description>
                        </header>

                        <div className="mt-6 rounded-[28px] border border-[#2A2A2A] bg-[#050505] p-5">
                          <p className="font-display text-xl font-medium tracking-tight text-white">
                            {reviewBook?.title ??
                              target?.bookTitle ??
                              tDashboard("review_dialog_book_fallback")}
                          </p>
                        </div>

                        {isLoading ? (
                          <p className="font-sans mt-6 text-sm text-[#A9A9A9]">
                            {tDashboard("review_dialog_loading")}
                          </p>
                        ) : null}

                        {existingReview ? (
                          <div className="mt-6 rounded-[28px] border border-[#2A2A2A] bg-[#050505] p-5">
                            <p className="font-sans text-sm font-medium text-white">
                              {tDashboard("review_dialog_already_submitted")}
                            </p>

                            <div className="mt-5 flex items-center gap-2">
                              {Array.from({ length: STAR_COUNT }, (_, index) => {
                                const value = index + 1;
                                const isFilled = existingReview.rating >= value;

                                return (
                                  <Star
                                    key={value}
                                    aria-hidden="true"
                                    className={cn(
                                      "size-7 sm:size-8",
                                      isFilled ? "fill-[#007eff] text-[#007eff]" : "text-[#2A2A2A]"
                                    )}
                                  />
                                );
                              })}
                            </div>

                            {existingReview.comment ? (
                              <p className="font-sans mt-5 text-sm leading-6 text-[#D9D9D9]">
                                {existingReview.comment}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {pendingBook ? (
                          <div className="mt-6 flex flex-1 flex-col">
                            <p className="font-sans text-sm leading-6 text-[#D9D9D9]">
                              {tDashboard("review_dialog_pending_description")}
                            </p>

                            <div className="mt-8">
                              <p className="font-sans text-sm font-semibold text-white">
                                {tDashboard("review_rating")}
                              </p>
                              <ReviewRatingStars
                                rating={rating}
                                hoveredRating={hoveredRating}
                                isDisabled={isPending}
                                ariaLabel={tDashboard("review_dialog_rating_group_aria")}
                                getOptionAriaLabel={(count) =>
                                  tDashboard("review_dialog_rating_option", { count })
                                }
                                onRatingChange={setRating}
                                onHoverChange={setHoveredRating}
                              />
                            </div>

                            <div className="mt-8">
                              <label
                                htmlFor="dashboard-review-comment"
                                className="font-sans text-sm font-semibold text-white"
                              >
                                {tDashboard("review_comment")}
                              </label>
                              <textarea
                                id="dashboard-review-comment"
                                value={comment}
                                onChange={(event) => setComment(event.target.value)}
                                rows={6}
                                maxLength={2000}
                                placeholder={tDashboard("review_dialog_comment_placeholder")}
                                className="font-sans mt-3 min-h-40 w-full rounded-[24px] border border-[#2A2A2A] bg-[#050505] px-4 py-4 text-sm leading-6 text-white placeholder:text-[#666666] focus:border-[#007eff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]/50"
                              />
                            </div>

                            <div className="mt-8 flex flex-col gap-3">
                              <button
                                type="button"
                                onClick={() => void handleSubmit()}
                                disabled={isPending}
                                className="font-sans inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#007eff] px-5 text-sm font-bold text-white transition-[transform,background-color] duration-150 hover:scale-[0.995] hover:bg-[#006ddf] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-[#1f4f87] disabled:text-[#d0d0d0]"
                              >
                                {isPending
                                  ? tDashboard("review_dialog_submit_loading")
                                  : tDashboard("review_submit")}
                              </button>

                              <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="font-sans inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-transparent px-5 text-sm font-medium text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#111111] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                              >
                                {tDashboard("review_dialog_cancel")}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {isUnavailable ? (
                          <div className="mt-6 rounded-[28px] border border-[#2A2A2A] bg-[#050505] p-5">
                            <p className="font-sans text-sm leading-6 text-[#D9D9D9]">
                              {tDashboard("review_dialog_unavailable")}
                            </p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </motion.section>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
