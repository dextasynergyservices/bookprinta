"use client";

import type { AdminReviewsListResponse } from "@bookprinta/shared";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminReviews,
  useDeleteAdminReviewMutation,
  useModerateAdminReviewMutation,
  useToggleAdminReviewVisibilityMutation,
} from "@/hooks/useAdminReviews";
import { cn } from "@/lib/utils";

type AdminReviewRow = AdminReviewsListResponse["items"][number];
type VisibilityFilter = "all" | "pending" | "public";
type RatingFilter = "all" | "1" | "2" | "3" | "4" | "5";

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const reviewsColumnHelper = createColumnHelper<AdminReviewRow>();
const STAR_POSITIONS = [1, 2, 3, 4, 5] as const;

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatAdminDateTime(value: string, locale: string, fallback: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function getFilterControlClass(isActive: boolean): string {
  return cn(
    "h-11 rounded-full border bg-[#080808] px-4 font-sans text-sm text-white transition-colors duration-150",
    "focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25",
    isActive
      ? "border-[#007eff]/65 shadow-[0_0_0_1px_rgba(0,126,255,0.25)]"
      : "border-[#2A2A2A] hover:border-[#3A3A3A]"
  );
}

function ReviewRatingStars({ rating }: { rating: number }) {
  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {STAR_POSITIONS.map((position) => {
        const isFilled = position <= rating;

        return (
          <Star
            key={`star-${position}`}
            className={cn(
              "size-3.5",
              isFilled ? "fill-[#facc15] text-[#facc15]" : "text-[#4A4A4A]"
            )}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

function ReviewVisibilityBadge({ isPublic, label }: { isPublic: boolean; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        isPublic
          ? "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]"
          : "border-[#f59e0b]/45 bg-[#f59e0b]/15 text-[#f59e0b]"
      )}
    >
      {label}
    </Badge>
  );
}

function getCommentSnippet(comment: string | null, fallback: string): string {
  const normalizedComment = comment?.trim();
  if (!normalizedComment) {
    return fallback;
  }

  if (normalizedComment.length <= 120) {
    return normalizedComment;
  }

  return `${normalizedComment.slice(0, 117)}...`;
}

function renderReviewsSortableHeader(label: string) {
  return (
    <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium tracking-[0.08em] text-[#BDBDBD] uppercase">
      {label}
      <ArrowUpDown className="size-3 text-[#8F8F8F]" aria-hidden="true" />
    </span>
  );
}

export function AdminReviewsView() {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();

  const [searchDraft, setSearchDraft] = useState("");
  const deferredSearch = useDeferredValue(searchDraft.trim());
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("pending");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [cursorTrail, setCursorTrail] = useState<string[]>([""]);
  const [deleteTarget, setDeleteTarget] = useState<AdminReviewRow | null>(null);
  const [editTarget, setEditTarget] = useState<AdminReviewRow | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState("");
  const searchInputId = useId();
  const visibilitySelectId = useId();
  const ratingSelectId = useId();

  const filterResetKey = `${deferredSearch}|${visibilityFilter}|${ratingFilter}`;

  useEffect(() => {
    void filterResetKey;
    setCursorTrail([""]);
  }, [filterResetKey]);

  const currentCursor = cursorTrail[cursorTrail.length - 1] ?? "";
  const pageNumber = cursorTrail.length;

  const reviewsQuery = useAdminReviews({
    cursor: currentCursor || undefined,
    limit: 20,
    q: deferredSearch || undefined,
    isPublic: visibilityFilter === "all" ? undefined : visibilityFilter === "public",
    rating: ratingFilter === "all" ? undefined : Number(ratingFilter),
  });

  const toggleVisibilityMutation = useToggleAdminReviewVisibilityMutation();
  const moderateReviewMutation = useModerateAdminReviewMutation();
  const deleteReviewMutation = useDeleteAdminReviewMutation();

  const isMutationPending =
    toggleVisibilityMutation.isPending ||
    moderateReviewMutation.isPending ||
    deleteReviewMutation.isPending;

  const handleToggleVisibility = useCallback(
    async (review: AdminReviewRow) => {
      try {
        await toggleVisibilityMutation.mutateAsync({
          reviewId: review.id,
          isPublic: !review.isPublic,
        });

        toast.success(tAdmin("reviews_toast_visibility_updated"));
      } catch (error) {
        toast.error(getErrorMessage(error, tAdmin("reviews_toast_update_failed")));
      }
    },
    [tAdmin, toggleVisibilityMutation]
  );

  const handleSaveComment = useCallback(async () => {
    if (!editTarget) return;

    const normalizedComment = editCommentDraft.trim();
    const currentComment = editTarget.comment?.trim() ?? "";

    if (normalizedComment === currentComment) {
      setEditTarget(null);
      return;
    }

    try {
      await moderateReviewMutation.mutateAsync({
        reviewId: editTarget.id,
        input: {
          comment: normalizedComment.length > 0 ? normalizedComment : null,
        },
      });

      toast.success(tAdmin("reviews_toast_comment_updated"));
      setEditTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("reviews_toast_update_failed")));
    }
  }, [editCommentDraft, editTarget, moderateReviewMutation, tAdmin]);

  const handleDeleteReview = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      await deleteReviewMutation.mutateAsync(deleteTarget.id);
      toast.success(tAdmin("reviews_toast_deleted"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("reviews_toast_delete_failed")));
    }
  }, [deleteReviewMutation, deleteTarget, tAdmin]);

  const activeFilterCount =
    (deferredSearch.length > 0 ? 1 : 0) +
    (visibilityFilter !== "pending" ? 1 : 0) +
    (ratingFilter !== "all" ? 1 : 0);

  const reviewRows = reviewsQuery.items;
  const pendingCount = reviewRows.filter((review) => !review.isPublic).length;
  const publicCount = reviewRows.filter((review) => review.isPublic).length;

  const columns = useMemo(
    () => [
      reviewsColumnHelper.accessor("bookTitle", {
        id: "bookTitle",
        header: () => renderReviewsSortableHeader(tAdmin("reviews_table_book")),
        cell: ({ row }) => {
          const title = row.original.bookTitle?.trim() || tAdmin("reviews_book_untitled");

          return (
            <div className="min-w-0">
              <p className="truncate font-sans text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 truncate font-sans text-xs text-[#8B8B8B]">
                #{row.original.bookId}
              </p>
            </div>
          );
        },
      }),
      reviewsColumnHelper.accessor("authorName", {
        id: "authorName",
        header: () => renderReviewsSortableHeader(tAdmin("reviews_table_author")),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-sans text-sm font-medium text-[#EDEDED]">
              {row.original.authorName}
            </p>
            <p className="mt-1 truncate font-sans text-xs text-[#8B8B8B]">
              {row.original.authorEmail}
            </p>
          </div>
        ),
      }),
      reviewsColumnHelper.accessor("rating", {
        id: "rating",
        header: () => renderReviewsSortableHeader(tAdmin("reviews_table_rating")),
        cell: ({ row }) => (
          <div className="inline-flex items-center gap-2">
            <ReviewRatingStars rating={row.original.rating} />
            <span className="font-sans text-xs text-[#A3A3A3]">{row.original.rating}/5</span>
          </div>
        ),
      }),
      reviewsColumnHelper.accessor("comment", {
        id: "comment",
        header: () => renderReviewsSortableHeader(tAdmin("reviews_table_comment")),
        cell: ({ row }) => {
          const snippet = getCommentSnippet(row.original.comment, tAdmin("reviews_comment_empty"));

          return (
            <p
              className="line-clamp-2 max-w-[22rem] font-sans text-sm text-[#C7C7C7]"
              title={snippet}
            >
              {snippet}
            </p>
          );
        },
      }),
      reviewsColumnHelper.accessor("isPublic", {
        id: "isPublic",
        header: () => renderReviewsSortableHeader(tAdmin("reviews_table_status")),
        cell: ({ row }) => (
          <ReviewVisibilityBadge
            isPublic={row.original.isPublic}
            label={
              row.original.isPublic
                ? tAdmin("reviews_visibility_public")
                : tAdmin("reviews_visibility_pending")
            }
          />
        ),
      }),
      reviewsColumnHelper.accessor("createdAt", {
        id: "createdAt",
        header: () => renderReviewsSortableHeader(tAdmin("reviews_table_created")),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#D0D0D0]">
            {formatAdminDateTime(row.original.createdAt, locale, "-")}
          </span>
        ),
      }),
      reviewsColumnHelper.display({
        id: "actions",
        header: () => (
          <span className="inline-flex w-full items-center justify-end gap-1 font-sans text-[11px] font-medium tracking-[0.08em] text-[#BDBDBD] uppercase">
            {tAdmin("reviews_table_actions")}
            <ArrowUpDown className="size-3 text-[#8F8F8F]" aria-hidden="true" />
          </span>
        ),
        cell: ({ row }) => {
          const review = row.original;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tAdmin("reviews_actions_menu_sr")}
                    className="size-9 rounded-full border border-[#2A2A2A] bg-[#000000] text-[#D1D1D1] hover:border-[#007eff] hover:bg-[#101010] hover:text-white"
                    disabled={isMutationPending}
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onSelect={() => {
                      void handleToggleVisibility(review);
                    }}
                    disabled={isMutationPending}
                  >
                    {review.isPublic
                      ? tAdmin("reviews_action_unpublish")
                      : tAdmin("reviews_action_publish")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditTarget(review);
                      setEditCommentDraft(review.comment ?? "");
                    }}
                    disabled={isMutationPending}
                  >
                    {tAdmin("reviews_action_edit_comment")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-[#ef4444] focus:text-[#ef4444]"
                    onSelect={() => {
                      setDeleteTarget(review);
                    }}
                    disabled={isMutationPending}
                  >
                    {tAdmin("reviews_action_delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }),
    ],
    [handleToggleVisibility, isMutationPending, locale, tAdmin]
  );

  const reviewsTable = useReactTable({
    data: reviewRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function handleClearFilters() {
    setSearchDraft("");
    setVisibilityFilter("pending");
    setRatingFilter("all");
  }

  function handleNextPage() {
    if (!reviewsQuery.hasMore || !reviewsQuery.nextCursor) return;

    setCursorTrail((previousTrail) => {
      const nextCursor = reviewsQuery.nextCursor;
      if (!nextCursor || previousTrail[previousTrail.length - 1] === nextCursor) {
        return previousTrail;
      }

      return [...previousTrail, nextCursor];
    });
  }

  function handlePreviousPage() {
    if (cursorTrail.length <= 1) return;

    setCursorTrail((previousTrail) => previousTrail.slice(0, -1));
  }

  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {tAdmin("reviews")}
        </h1>
        <p className="mt-3 max-w-3xl font-sans text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("reviews_workspace_description")}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-[#202020] bg-[#0A0A0A] px-4 py-3">
            <p className="font-sans text-xs uppercase tracking-[0.18em] text-[#7C7C7C]">
              {tAdmin("reviews_visibility_pending")}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-white">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border border-[#202020] bg-[#0A0A0A] px-4 py-3">
            <p className="font-sans text-xs uppercase tracking-[0.18em] text-[#7C7C7C]">
              {tAdmin("reviews_visibility_public")}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-white">{publicCount}</p>
          </div>
          <div className="rounded-2xl border border-[#202020] bg-[#0A0A0A] px-4 py-3 sm:col-span-2 xl:col-span-1">
            <p className="font-sans text-xs uppercase tracking-[0.18em] text-[#7C7C7C]">
              {tAdmin("reviews_summary_label")}
            </p>
            <p className="mt-2 font-sans text-sm text-[#D3D3D3]">
              {tAdmin("reviews_summary_total", { shown: reviewRows.length, page: pageNumber })}
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label htmlFor={searchInputId} className="grid gap-1.5">
              <span className="font-sans text-xs font-medium tracking-[0.08em] text-[#8B8B8B] uppercase">
                {tAdmin("reviews_filters_search_label")}
              </span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5A5A5A]"
                  aria-hidden="true"
                />
                <Input
                  id={searchInputId}
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder={tAdmin("reviews_filters_search_placeholder")}
                  className={cn(getFilterControlClass(deferredSearch.length > 0), "pl-9")}
                />
              </div>
            </label>

            <label htmlFor={visibilitySelectId} className="grid gap-1.5">
              <span className="font-sans text-xs font-medium tracking-[0.08em] text-[#8B8B8B] uppercase">
                {tAdmin("reviews_filters_visibility_label")}
              </span>
              <Select
                value={visibilityFilter}
                onValueChange={(value) => setVisibilityFilter(value as VisibilityFilter)}
              >
                <SelectTrigger
                  id={visibilitySelectId}
                  className={getFilterControlClass(visibilityFilter !== "pending")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">
                    {tAdmin("reviews_filters_visibility_pending")}
                  </SelectItem>
                  <SelectItem value="public">
                    {tAdmin("reviews_filters_visibility_public")}
                  </SelectItem>
                  <SelectItem value="all">{tAdmin("reviews_filters_visibility_all")}</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label htmlFor={ratingSelectId} className="grid gap-1.5">
              <span className="font-sans text-xs font-medium tracking-[0.08em] text-[#8B8B8B] uppercase">
                {tAdmin("reviews_filters_rating_label")}
              </span>
              <Select
                value={ratingFilter}
                onValueChange={(value) => setRatingFilter(value as RatingFilter)}
              >
                <SelectTrigger
                  id={ratingSelectId}
                  className={getFilterControlClass(ratingFilter !== "all")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tAdmin("reviews_filters_rating_all")}</SelectItem>
                  <SelectItem value="5">
                    {tAdmin("reviews_filters_rating_option", { count: 5 })}
                  </SelectItem>
                  <SelectItem value="4">
                    {tAdmin("reviews_filters_rating_option", { count: 4 })}
                  </SelectItem>
                  <SelectItem value="3">
                    {tAdmin("reviews_filters_rating_option", { count: 3 })}
                  </SelectItem>
                  <SelectItem value="2">
                    {tAdmin("reviews_filters_rating_option", { count: 2 })}
                  </SelectItem>
                  <SelectItem value="1">
                    {tAdmin("reviews_filters_rating_option", { count: 1 })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="font-sans text-xs text-[#8B8B8B]">
              {activeFilterCount > 0
                ? tAdmin("reviews_filters_active", { count: activeFilterCount })
                : tAdmin("reviews_filters_idle")}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full border-[#2A2A2A] bg-[#0A0A0A] text-[#D2D2D2] hover:bg-[#141414] hover:text-white"
              onClick={handleClearFilters}
              disabled={activeFilterCount === 0}
            >
              {tAdmin("reviews_filters_clear")}
            </Button>
          </div>
        </div>
      </section>

      {reviewsQuery.isError ? (
        <section className="rounded-[1.5rem] border border-[#4A1D1D] bg-[#140808] p-5 md:p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 text-[#f87171]" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-sans text-base font-semibold text-[#fecaca]">
                {tAdmin("reviews_error_title")}
              </h2>
              <p className="mt-1 font-sans text-sm text-[#fca5a5]">
                {getErrorMessage(reviewsQuery.error, tAdmin("reviews_error_description"))}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 h-10 rounded-full border-[#7f1d1d] bg-[#2b0f0f] text-[#fecaca] hover:bg-[#3a1515]"
                onClick={() => {
                  void reviewsQuery.refetch();
                }}
              >
                {tAdmin("reviews_retry")}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <DashboardResponsiveDataRegion
          mobileCards={
            reviewRows.length === 0 && !reviewsQuery.isInitialLoading ? (
              <div className="rounded-[1.5rem] border border-[#1D1D1D] bg-[#090909] p-5">
                <h3 className="font-display text-xl font-semibold text-white">
                  {tAdmin("reviews_empty_title")}
                </h3>
                <p className="mt-2 font-sans text-sm text-[#9A9A9A]">
                  {tAdmin("reviews_empty_description")}
                </p>
              </div>
            ) : (
              reviewRows.map((review) => (
                <article
                  key={review.id}
                  className="rounded-[1.35rem] border border-[#1E1E1E] bg-[#0A0A0A] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-sans text-sm font-semibold text-white">
                        {review.bookTitle?.trim() || tAdmin("reviews_book_untitled")}
                      </h3>
                      <p className="mt-1 truncate font-sans text-xs text-[#8A8A8A]">
                        {review.authorName}
                      </p>
                    </div>
                    <ReviewVisibilityBadge
                      isPublic={review.isPublic}
                      label={
                        review.isPublic
                          ? tAdmin("reviews_visibility_public")
                          : tAdmin("reviews_visibility_pending")
                      }
                    />
                  </div>

                  <div className="mt-3 inline-flex items-center gap-2">
                    <ReviewRatingStars rating={review.rating} />
                    <span className="font-sans text-xs text-[#A3A3A3]">{review.rating}/5</span>
                  </div>

                  <p className="mt-3 font-sans text-sm leading-6 text-[#C9C9C9]">
                    {getCommentSnippet(review.comment, tAdmin("reviews_comment_empty"))}
                  </p>

                  <p className="mt-3 font-sans text-xs text-[#8A8A8A]">
                    {formatAdminDateTime(review.createdAt, locale, "-")}
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 flex-1 rounded-full border-[#2A2A2A] bg-[#0B0B0B] text-xs text-[#D8D8D8] hover:bg-[#141414]"
                      onClick={() => {
                        void handleToggleVisibility(review);
                      }}
                      disabled={isMutationPending}
                    >
                      {review.isPublic ? (
                        <EyeOff className="mr-1.5 size-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="mr-1.5 size-3.5" aria-hidden="true" />
                      )}
                      {review.isPublic
                        ? tAdmin("reviews_action_unpublish")
                        : tAdmin("reviews_action_publish")}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 rounded-full border border-[#2A2A2A] bg-[#000000] text-[#D1D1D1] hover:border-[#007eff] hover:bg-[#101010] hover:text-white"
                          aria-label={tAdmin("reviews_actions_menu_sr")}
                          disabled={isMutationPending}
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditTarget(review);
                            setEditCommentDraft(review.comment ?? "");
                          }}
                          disabled={isMutationPending}
                        >
                          <Pencil className="mr-2 size-4" aria-hidden="true" />
                          {tAdmin("reviews_action_edit_comment")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-[#ef4444] focus:text-[#ef4444]"
                          onSelect={() => {
                            setDeleteTarget(review);
                          }}
                          disabled={isMutationPending}
                        >
                          <Trash2 className="mr-2 size-4" aria-hidden="true" />
                          {tAdmin("reviews_action_delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </article>
              ))
            )
          }
          desktopTable={
            <DashboardTableViewport minWidthClassName="md:min-w-[860px] lg:min-w-[1040px] xl:min-w-[1160px]">
              <Table className="border-collapse">
                <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
                  {reviewsTable.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="border-b border-[#2A2A2A] hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={cn(
                            "h-12 border-b border-[#2A2A2A] px-4 align-middle text-[#D5D5D5]",
                            header.id === "bookTitle" && "min-w-[12rem]",
                            header.id === "authorName" && "min-w-[11rem]",
                            header.id === "rating" && "min-w-[7.5rem]",
                            header.id === "comment" && "hidden xl:table-cell min-w-[18rem]",
                            header.id === "isPublic" && "min-w-[8rem]",
                            header.id === "createdAt" && "hidden lg:table-cell min-w-[8.5rem]",
                            header.id === "actions" && "min-w-[7rem] text-right"
                          )}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {reviewRows.length === 0 && !reviewsQuery.isInitialLoading ? (
                    <TableRow className="border-b border-[#2A2A2A] bg-[#111111] hover:bg-transparent">
                      <TableCell colSpan={columns.length} className="py-14 text-center">
                        <h3 className="font-display text-2xl font-semibold text-white">
                          {tAdmin("reviews_empty_title")}
                        </h3>
                        <p className="mt-2 font-sans text-sm text-[#9A9A9A]">
                          {tAdmin("reviews_empty_description")}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reviewsTable.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="border-b border-[#2A2A2A] bg-[#111111] transition-colors duration-150 hover:bg-[#1A1A1A] last:border-b-0"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={cn(
                              "px-4 py-4 align-middle",
                              cell.column.id === "comment" &&
                                "hidden xl:table-cell whitespace-normal",
                              cell.column.id === "createdAt" && "hidden lg:table-cell",
                              cell.column.id === "actions" && "text-right"
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DashboardTableViewport>
          }
        />
      )}

      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[#1D1D1D] bg-[#090909] px-4 py-3"
        aria-label={tAdmin("reviews_pagination_aria")}
      >
        <p className="font-sans text-xs text-[#9A9A9A]">
          {reviewsQuery.isPageTransitioning
            ? tAdmin("reviews_loading_more")
            : tAdmin("reviews_pagination_page", { page: pageNumber })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full border-[#2A2A2A] bg-[#0A0A0A] px-3 text-xs text-[#D8D8D8] hover:bg-[#141414]"
            onClick={handlePreviousPage}
            disabled={cursorTrail.length <= 1 || reviewsQuery.isFetching}
          >
            <ChevronLeft className="mr-1 size-3.5" aria-hidden="true" />
            {tAdmin("reviews_pagination_previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full border-[#2A2A2A] bg-[#0A0A0A] px-3 text-xs text-[#D8D8D8] hover:bg-[#141414]"
            onClick={handleNextPage}
            disabled={!reviewsQuery.hasMore || reviewsQuery.isFetching}
          >
            {tAdmin("reviews_pagination_next")}
            <ChevronRight className="ml-1 size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </section>

      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditTarget(null);
          }
        }}
      >
        <DialogContent className="border-[#252525] bg-[#0A0A0A] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold text-white">
              {tAdmin("reviews_edit_dialog_title")}
            </DialogTitle>
            <DialogDescription className="font-sans text-sm text-[#9B9B9B]">
              {tAdmin("reviews_edit_dialog_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <p className="font-sans text-xs font-medium tracking-[0.08em] text-[#8B8B8B] uppercase">
              {tAdmin("reviews_edit_dialog_field_label")}
            </p>
            <Textarea
              value={editCommentDraft}
              onChange={(event) => setEditCommentDraft(event.target.value)}
              placeholder={tAdmin("reviews_edit_dialog_placeholder")}
              className="min-h-32 border-[#2A2A2A] bg-[#0F0F0F] text-sm text-white placeholder:text-[#666666]"
              maxLength={2000}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-[#2A2A2A] bg-[#0A0A0A] text-[#D8D8D8] hover:bg-[#141414]"
              onClick={() => setEditTarget(null)}
              disabled={moderateReviewMutation.isPending}
            >
              {tAdmin("reviews_edit_dialog_cancel")}
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[#007eff] text-white hover:bg-[#0f6ecf]"
              onClick={() => {
                void handleSaveComment();
              }}
              disabled={moderateReviewMutation.isPending}
            >
              {tAdmin("reviews_edit_dialog_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0A0A0A] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl font-semibold text-white">
              {tAdmin("reviews_delete_dialog_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm text-[#9B9B9B]">
              {tAdmin("reviews_delete_dialog_description")}
            </AlertDialogDescription>
            {deleteTarget ? (
              <p className="font-sans text-sm text-[#BFBFBF]">
                {tAdmin("reviews_delete_dialog_target", {
                  name: deleteTarget.bookTitle?.trim() || tAdmin("reviews_book_untitled"),
                })}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-[#2A2A2A] bg-[#0A0A0A] text-[#D8D8D8] hover:bg-[#141414]">
              {tAdmin("reviews_delete_dialog_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#b91c1c] text-white hover:bg-[#991b1b]"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteReview();
              }}
              disabled={deleteReviewMutation.isPending}
            >
              {tAdmin("reviews_delete_dialog_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
