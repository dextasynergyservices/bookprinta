"use client";

import type { UserBookListItem } from "@bookprinta/shared";
import {
  type ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { BookStatusBadge } from "@/components/dashboard/books/book-status-badge";
import {
  DashboardErrorState,
  OrderRowSkeleton,
} from "@/components/dashboard/dashboard-async-primitives";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useUserBooks } from "@/hooks/useUserBooks";
import {
  formatDashboardDate,
  formatDashboardInteger,
  toDashboardStatusLabel,
} from "@/lib/dashboard/dashboard-formatters";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 10;
const SKELETON_CARD_COUNT = 4;
const SKELETON_TABLE_ROW_COUNT = 6;
const TABLE_COLUMN_COUNT = 5;
const TABLE_TRANSITION_SKELETON_KEYS = [
  "table-transition-skeleton-1",
  "table-transition-skeleton-2",
] as const;
const MOBILE_TRANSITION_SKELETON_KEYS = [
  "mobile-transition-skeleton-1",
  "mobile-transition-skeleton-2",
] as const;
const MOBILE_SKELETON_KEYS = Array.from(
  { length: SKELETON_CARD_COUNT },
  (_unused, index) => `books-mobile-skeleton-${index + 1}`
);
const TABLE_SKELETON_COLUMN_KEYS = [
  "books-table-head-title",
  "books-table-head-status",
  "books-table-head-pages",
  "books-table-head-updated",
  "books-table-head-actions",
] as const;
const TABLE_SKELETON_ROW_KEYS = Array.from(
  { length: SKELETON_TABLE_ROW_COUNT },
  (_unused, index) => `books-table-row-skeleton-${index + 1}`
);

function formatBookDate(value: string | null, locale: string, fallback: string): string {
  return (
    formatDashboardDate(value, locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) ?? fallback
  );
}

function getDesktopHeaderClass(columnId: string): string {
  if (columnId === "title") return "min-w-[12rem] whitespace-normal";
  if (columnId === "status") return "min-w-[9rem]";
  if (columnId === "pages") return "min-w-[6rem]";
  if (columnId === "updated") return "min-w-[8rem]";
  if (columnId === "actions") return "min-w-[10rem] text-right";
  return "";
}

function getDesktopCellClass(columnId: string): string {
  if (columnId === "title") return "max-w-[16rem] whitespace-normal";
  if (columnId === "status") return "whitespace-nowrap";
  if (columnId === "pages") return "whitespace-nowrap";
  if (columnId === "updated") return "whitespace-nowrap";
  if (columnId === "actions") return "whitespace-nowrap text-right";
  return "";
}

type BooksDesktopTableProps = {
  items: UserBookListItem[];
  locale: string;
  transitioning: boolean;
  prefersReducedMotion: boolean;
};

function BooksDesktopTable({
  items,
  locale,
  transitioning,
  prefersReducedMotion,
}: BooksDesktopTableProps) {
  const tDashboard = useTranslations("dashboard");

  const columns = useMemo<ColumnDef<UserBookListItem>[]>(
    () => [
      createColumnHelper<UserBookListItem>().display({
        id: "title",
        header: () => tDashboard("books_table_title"),
        cell: ({ row }) => (
          <span className="font-sans text-sm font-medium text-white">
            {row.original.title ?? tDashboard("books_untitled")}
          </span>
        ),
      }),
      createColumnHelper<UserBookListItem>().display({
        id: "status",
        header: () => tDashboard("books_table_status"),
        cell: ({ row }) => (
          <BookStatusBadge
            status={row.original.status}
            productionStatus={row.original.productionStatus}
            label={
              toDashboardStatusLabel(row.original.productionStatus ?? row.original.status) ??
              tDashboard("books_unknown_status")
            }
          />
        ),
      }),
      createColumnHelper<UserBookListItem>().display({
        id: "pages",
        header: () => tDashboard("books_table_pages"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#d0d0d0]">
            {typeof row.original.pageCount === "number"
              ? formatDashboardInteger(row.original.pageCount, locale)
              : "—"}
          </span>
        ),
      }),
      createColumnHelper<UserBookListItem>().display({
        id: "updated",
        header: () => tDashboard("books_table_updated"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#d0d0d0]">
            {formatBookDate(row.original.updatedAt, locale, "—")}
          </span>
        ),
      }),
      createColumnHelper<UserBookListItem>().display({
        id: "actions",
        header: () => tDashboard("books_table_actions"),
        cell: ({ row }) => (
          <Link
            href={`/dashboard/books/${row.original.id}`}
            className="font-sans inline-flex min-h-10 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 text-[11px] font-semibold whitespace-nowrap tracking-[0.02em] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 lg:min-h-11 lg:text-xs"
          >
            {tDashboard("books_action_open")}
          </Link>
        ),
      }),
    ],
    [locale, tDashboard]
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DashboardTableViewport
      className="touch-pan-x"
      minWidthClassName="md:min-w-[720px] lg:min-w-[860px]"
    >
      <Table className="min-w-[720px] border-collapse lg:min-w-[860px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-[#2A2A2A]">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    "h-12 px-4 font-sans text-[11px] font-semibold tracking-[0.08em] text-[#bdbdbd] uppercase",
                    getDesktopHeaderClass(header.id)
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </tr>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <motion.tr
              key={row.id}
              initial={false}
              whileHover={
                prefersReducedMotion ? undefined : { scale: 1.002, backgroundColor: "#161616" }
              }
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="border-b border-[#2A2A2A] bg-[#111111] last:border-b-0"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn("px-4 py-4 align-middle", getDesktopCellClass(cell.column.id))}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </motion.tr>
          ))}
        </TableBody>

        {transitioning ? (
          <TableBody aria-hidden="true">
            {TABLE_TRANSITION_SKELETON_KEYS.map((skeletonRowKey) => (
              <tr key={skeletonRowKey} className="border-t border-[#2A2A2A]">
                <TableCell colSpan={TABLE_COLUMN_COUNT} className="px-4 py-4">
                  <OrderRowSkeleton />
                </TableCell>
              </tr>
            ))}
          </TableBody>
        ) : null}
      </Table>
    </DashboardTableViewport>
  );
}

type BooksMobileCardsProps = {
  items: UserBookListItem[];
  locale: string;
  transitioning: boolean;
  prefersReducedMotion: boolean;
};

function BooksMobileCards({
  items,
  locale,
  transitioning,
  prefersReducedMotion,
}: BooksMobileCardsProps) {
  const tDashboard = useTranslations("dashboard");

  return (
    <>
      {items.map((book) => (
        <motion.article
          key={book.id}
          initial={false}
          whileHover={
            prefersReducedMotion ? undefined : { scale: 1.01, backgroundColor: "#151515" }
          }
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="font-sans min-w-0 text-sm font-medium text-white truncate">
              {book.title ?? tDashboard("books_untitled")}
            </span>
            <BookStatusBadge
              status={book.status}
              productionStatus={book.productionStatus}
              label={
                toDashboardStatusLabel(book.productionStatus ?? book.status) ??
                tDashboard("books_unknown_status")
              }
            />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="font-sans text-[11px] leading-none font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("books_table_pages")}
              </dt>
              <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">
                {typeof book.pageCount === "number"
                  ? formatDashboardInteger(book.pageCount, locale)
                  : "—"}
              </dd>
            </div>

            <div className="text-right">
              <dt className="font-sans text-[11px] leading-none font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("books_table_updated")}
              </dt>
              <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">
                {formatBookDate(book.updatedAt, locale, "—")}
              </dd>
            </div>
          </dl>

          <Link
            href={`/dashboard/books/${book.id}`}
            className="font-sans mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 text-sm font-semibold tracking-[0.02em] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {tDashboard("books_action_open")}
          </Link>
        </motion.article>
      ))}

      {transitioning
        ? MOBILE_TRANSITION_SKELETON_KEYS.map((skeletonKey) => (
            <OrderRowSkeleton key={skeletonKey} />
          ))
        : null}
    </>
  );
}

function BooksMobileSkeleton() {
  return (
    <>
      {MOBILE_SKELETON_KEYS.map((skeletonKey) => (
        <OrderRowSkeleton key={skeletonKey} />
      ))}
    </>
  );
}

function BooksTableSkeleton() {
  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[720px] lg:min-w-[860px]">
      <Table className="min-w-[720px] border-collapse lg:min-w-[860px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          <tr className="border-b border-[#2A2A2A]">
            {TABLE_SKELETON_COLUMN_KEYS.map((columnKey) => (
              <TableHead key={columnKey} className="h-12 px-4">
                <div className="h-3 w-20 animate-pulse rounded bg-[#2A2A2A]" />
              </TableHead>
            ))}
          </tr>
        </TableHeader>

        <TableBody>
          {TABLE_SKELETON_ROW_KEYS.map((rowKey) => (
            <tr key={rowKey} className="border-b border-[#2A2A2A]">
              <TableCell colSpan={TABLE_COLUMN_COUNT} className="px-4 py-4">
                <OrderRowSkeleton />
              </TableCell>
            </tr>
          ))}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

function BooksEmptyState() {
  const tDashboard = useTranslations("dashboard");

  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <BookOpen className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {tDashboard("books_empty_title")}
      </h2>
      <p className="font-sans mt-2 max-w-md text-sm text-[#d0d0d0] md:text-base">
        {tDashboard("books_empty_description")}
      </p>
      <Link
        href="/dashboard/orders"
        className="font-sans mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-6 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
      >
        {tDashboard("books_empty_cta")}
      </Link>
    </section>
  );
}

type BooksErrorStateProps = {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
};

function BooksErrorState({ message, onRetry, isRetrying }: BooksErrorStateProps) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  return (
    <DashboardErrorState
      title={tDashboard("books_error_title")}
      description={message || tDashboard("books_error_description")}
      retryLabel={tCommon("retry")}
      loadingLabel={tCommon("loading")}
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
  );
}

type BooksPaginationControlsProps = {
  page: number;
  totalPages: number | null;
  canPrevious: boolean;
  canNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

function BooksPaginationControls({
  page,
  totalPages,
  canPrevious,
  canNext,
  loading,
  onPrevious,
  onNext,
}: BooksPaginationControlsProps) {
  const tDashboard = useTranslations("dashboard");

  return (
    <nav
      aria-label={tDashboard("books_pagination_aria")}
      className="flex flex-col gap-3 rounded-2xl border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
        {typeof totalPages === "number" && totalPages > 0
          ? tDashboard("books_pagination_page_of", { page, totalPages })
          : tDashboard("books_pagination_page", { page })}
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious || loading}
          variant="outline"
          className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 text-xs font-semibold text-white hover:bg-[#151515] disabled:opacity-45"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {tDashboard("books_pagination_previous")}
        </Button>

        <Button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          variant="outline"
          className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 text-xs font-semibold text-white hover:bg-[#151515] disabled:opacity-45"
        >
          {tDashboard("books_pagination_next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function BooksListView() {
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const [page, setPage] = useState(1);

  const { items, pagination, isError, refetch, isFetching, isInitialLoading, isPageTransitioning } =
    useUserBooks({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    });

  useEffect(() => {
    if (!isInitialLoading && !isPageTransitioning && !isFetching && pagination.page !== page) {
      setPage(pagination.page);
    }
  }, [isFetching, isInitialLoading, isPageTransitioning, page, pagination.page]);

  const hasData = items.length > 0;
  const showPagination = hasData || (pagination.totalItems ?? 0) > 0;
  const errorMessage = tDashboard("books_error_description");

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {tDashboard("books_list_title")}
        </h1>
        <p className="font-sans text-sm text-[#d0d0d0] md:text-base">
          {tDashboard("books_list_subtitle")}
        </p>
      </header>

      <div aria-live="polite" className="sr-only">
        {isPageTransitioning ? tDashboard("books_loading_more") : null}
      </div>

      {isError ? (
        <BooksErrorState message={errorMessage} onRetry={() => refetch()} isRetrying={isFetching} />
      ) : isInitialLoading ? (
        <DashboardResponsiveDataRegion
          mobileCards={<BooksMobileSkeleton />}
          desktopTable={<BooksTableSkeleton />}
        />
      ) : hasData ? (
        <DashboardResponsiveDataRegion
          mobileCards={
            <BooksMobileCards
              items={items}
              locale={locale}
              transitioning={isPageTransitioning}
              prefersReducedMotion={prefersReducedMotion}
            />
          }
          desktopTable={
            <BooksDesktopTable
              items={items}
              locale={locale}
              transitioning={isPageTransitioning}
              prefersReducedMotion={prefersReducedMotion}
            />
          }
        />
      ) : (
        <BooksEmptyState />
      )}

      {!isError && !isInitialLoading && showPagination ? (
        <BooksPaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          canPrevious={pagination.hasPreviousPage}
          canNext={pagination.hasNextPage}
          loading={isFetching}
          onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          onNext={() => setPage((currentPage) => currentPage + 1)}
        />
      ) : null}
    </section>
  );
}
