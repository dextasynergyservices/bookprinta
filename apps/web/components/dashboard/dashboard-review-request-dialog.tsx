"use client";

import { Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
};

export function DashboardReviewRequestDialog({
  open,
  target,
  onOpenChange,
}: DashboardReviewRequestDialogProps) {
  const tDashboard = useTranslations("dashboard");
  const prefersReducedMotion = useReducedMotion();
  const { pendingBooks, reviewedBooks, isLoading } = useReviewState();
  const { submitReview, isPending } = useCreateReview();
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!target) {
      setRating(0);
      setComment("");
      return;
    }

    const existingReview = reviewedBooks.find((review) => review.bookId === target.bookId);
    setRating(existingReview?.rating ?? 0);
    setComment(existingReview?.comment ?? "");
  }, [reviewedBooks, target]);

  const pendingBook = useMemo(
    () => pendingBooks.find((book) => book.bookId === target?.bookId) ?? null,
    [pendingBooks, target?.bookId]
  );
  const existingReview = useMemo(
    () => reviewedBooks.find((review) => review.bookId === target?.bookId) ?? null,
    [reviewedBooks, target?.bookId]
  );
  const isUnavailable = Boolean(target) && !isLoading && !pendingBook && !existingReview;

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
      toast.success(tDashboard("review_thanks"));
      onOpenChange(false);
    } catch {
      toast.error(tDashboard("review_dialog_submit_error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-w-[calc(100%-1rem)] rounded-[28px] border-[#2A2A2A] bg-[#111111] p-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.58)] sm:max-w-xl",
          prefersReducedMotion && "duration-0"
        )}
      >
        <div className="relative overflow-hidden rounded-[28px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 56% at 14% 0%, rgba(0,126,255,0.12) 0%, rgba(17,17,17,0) 70%)",
            }}
          />

          <div className="relative p-5 sm:p-6">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={tDashboard("review_dialog_close")}
              className="absolute top-4 right-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
            >
              <X className="size-4" aria-hidden="true" />
            </button>

            <DialogHeader className="pr-12 text-left">
              <DialogTitle className="font-display text-2xl font-semibold tracking-tight text-white">
                {tDashboard("review_dialog_title")}
              </DialogTitle>
              <DialogDescription className="font-sans text-sm leading-6 text-[#BDBDBD]">
                {tDashboard("review_dialog_subtitle")}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 rounded-[22px] border border-[#2A2A2A] bg-black/40 p-4">
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007eff]">
                {tDashboard("review_dialog_book_label")}
              </p>
              <p className="mt-2 font-display text-lg font-medium tracking-tight text-white">
                {target?.bookTitle || tDashboard("review_dialog_book_fallback")}
              </p>
            </div>

            {isLoading ? (
              <p className="mt-5 font-sans text-sm text-[#A9A9A9]">
                {tDashboard("review_dialog_loading")}
              </p>
            ) : null}

            {existingReview ? (
              <div className="mt-5 rounded-[22px] border border-[#2A2A2A] bg-[#0B0B0B] p-4">
                <p className="font-sans text-sm font-medium text-white">
                  {tDashboard("review_dialog_already_submitted")}
                </p>

                <div className="mt-4 flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, index) => {
                    const value = index + 1;

                    return (
                      <Star
                        key={value}
                        aria-hidden="true"
                        className={cn(
                          "size-5",
                          value <= existingReview.rating
                            ? "fill-[#FBBF24] text-[#FBBF24]"
                            : "text-[#3A3A3A]"
                        )}
                      />
                    );
                  })}
                </div>

                {existingReview.comment ? (
                  <p className="mt-4 font-sans text-sm leading-6 text-[#D9D9D9]">
                    {existingReview.comment}
                  </p>
                ) : null}
              </div>
            ) : null}

            {pendingBook ? (
              <div className="mt-5">
                <p className="font-sans text-sm text-[#D9D9D9]">
                  {tDashboard("review_dialog_pending_description")}
                </p>

                <div className="mt-5">
                  <p className="font-sans text-sm font-medium text-white">
                    {tDashboard("review_rating")}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={tDashboard("review_dialog_rating_group_aria")}
                    className="mt-3 flex flex-wrap gap-2"
                  >
                    {Array.from({ length: 5 }, (_, index) => {
                      const value = index + 1;

                      return (
                        <label key={value} className="cursor-pointer">
                          <input
                            type="radio"
                            name="dashboard-review-rating"
                            value={value}
                            checked={rating === value}
                            onChange={() => setRating(value)}
                            aria-label={tDashboard("review_dialog_rating_option", { count: value })}
                            className="peer sr-only"
                          />
                          <span
                            className={cn(
                              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-[#007eff] peer-focus-visible:outline-offset-2",
                              rating >= value
                                ? "border-[#FBBF24] bg-[#FBBF24]/12 text-[#FBBF24]"
                                : "border-[#2A2A2A] bg-[#111111] text-[#6D6D6D] hover:border-[#007eff] hover:text-white"
                            )}
                          >
                            <Star
                              className={cn("size-4", rating >= value ? "fill-current" : "")}
                              aria-hidden="true"
                            />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5">
                  <label
                    htmlFor="dashboard-review-comment"
                    className="font-sans text-sm font-medium text-white"
                  >
                    {tDashboard("review_comment")}
                  </label>
                  <textarea
                    id="dashboard-review-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={5}
                    maxLength={2000}
                    placeholder={tDashboard("review_dialog_comment_placeholder")}
                    className="font-sans mt-3 w-full rounded-[20px] border border-[#2A2A2A] bg-black px-4 py-3 text-sm leading-6 text-white placeholder:text-[#666666] focus:border-[#007eff] focus:outline-none"
                  />
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="font-sans inline-flex min-h-11 items-center justify-center rounded-full border border-[#2A2A2A] px-5 text-sm font-medium text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#161616] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                  >
                    {tDashboard("review_dialog_cancel")}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={isPending}
                    className="font-sans inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[0.99] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending
                      ? tDashboard("review_dialog_submit_loading")
                      : tDashboard("review_submit")}
                  </button>
                </div>
              </div>
            ) : null}

            {isUnavailable ? (
              <div className="mt-5 rounded-[22px] border border-[#2A2A2A] bg-[#0B0B0B] p-4">
                <p className="font-sans text-sm leading-6 text-[#D9D9D9]">
                  {tDashboard("review_dialog_unavailable")}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
