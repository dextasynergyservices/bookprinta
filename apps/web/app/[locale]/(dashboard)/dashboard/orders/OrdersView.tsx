"use client";

import {
  type ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import { AlertCircle, ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import {
  OrderMetaText,
  OrderReferenceText,
  OrderStatusBadge,
  ReprintBadge,
} from "@/components/dashboard/orders";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useOrders } from "@/hooks/useOrders";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { OrdersListItem } from "@/types/orders";

const DEFAULT_PAGE_SIZE = 10;
const SKELETON_CARD_COUNT = 4;
const SKELETON_TABLE_ROW_COUNT = 6;
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
  (_unused, index) => `orders-mobile-skeleton-${index + 1}`
);
const TABLE_SKELETON_COLUMN_KEYS = [
  "orders-table-head-ref",
  "orders-table-head-package",
  "orders-table-head-status",
  "orders-table-head-date",
  "orders-table-head-total",
  "orders-table-head-actions",
] as const;
const TABLE_SKELETON_ROW_KEYS = Array.from(
  { length: SKELETON_TABLE_ROW_COUNT },
  (_unused, index) => `orders-table-row-skeleton-${index + 1}`
);

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function toStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatOrderDate(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function formatOrderTotal(
  amount: number | null,
  currency: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return fallback;

  const currencyCode = (currency || "NGN").toUpperCase();

  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

type OrdersDesktopTableProps = {
  items: OrdersListItem[];
  locale: string;
  transitioning: boolean;
  prefersReducedMotion: boolean;
};

function getDesktopHeaderClass(columnId: string): string {
  if (columnId === "reference") return "min-w-[10.5rem] whitespace-normal";
  if (columnId === "package") return "min-w-[10rem] whitespace-normal";
  if (columnId === "status") return "min-w-[8.5rem]";
  if (columnId === "date") return "min-w-[8rem]";
  if (columnId === "total") return "min-w-[8rem] text-right";
  if (columnId === "actions") return "min-w-[12rem] text-right";
  return "";
}

function getDesktopCellClass(columnId: string): string {
  if (columnId === "reference") return "max-w-[12rem] whitespace-normal";
  if (columnId === "package") return "max-w-[14rem] whitespace-normal";
  if (columnId === "status") return "whitespace-nowrap";
  if (columnId === "date") return "whitespace-nowrap";
  if (columnId === "total") return "whitespace-nowrap text-right";
  if (columnId === "actions") return "whitespace-nowrap text-right";
  return "";
}

function OrdersDesktopTable({
  items,
  locale,
  transitioning,
  prefersReducedMotion,
}: OrdersDesktopTableProps) {
  const tDashboard = useTranslations("dashboard");

  const columns = useMemo<ColumnDef<OrdersListItem>[]>(
    () => [
      createColumnHelper<OrdersListItem>().display({
        id: "reference",
        header: () => tDashboard("orders_table_ref"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <OrderReferenceText>{row.original.orderNumber}</OrderReferenceText>
            <ReprintBadge
              orderType={row.original.orderType}
              label={tDashboard("orders_reprint_badge")}
            />
          </div>
        ),
      }),
      createColumnHelper<OrdersListItem>().display({
        id: "package",
        header: () => tDashboard("orders_table_package"),
        cell: ({ row }) => (
          <OrderMetaText>
            {row.original.packageName ?? tDashboard("orders_unknown_package")}
          </OrderMetaText>
        ),
      }),
      createColumnHelper<OrdersListItem>().display({
        id: "status",
        header: () => tDashboard("orders_table_status"),
        cell: ({ row }) => (
          <OrderStatusBadge
            orderStatus={row.original.orderStatus}
            bookStatus={row.original.bookStatus}
            label={
              toStatusLabel(row.original.bookStatus ?? row.original.orderStatus) ??
              tDashboard("orders_unknown_status")
            }
          />
        ),
      }),
      createColumnHelper<OrdersListItem>().display({
        id: "date",
        header: () => tDashboard("orders_table_date"),
        cell: ({ row }) => (
          <OrderMetaText>
            {formatOrderDate(row.original.createdAt, locale, tDashboard("orders_unknown_date"))}
          </OrderMetaText>
        ),
      }),
      createColumnHelper<OrdersListItem>().display({
        id: "total",
        header: () => tDashboard("orders_table_total"),
        cell: ({ row }) => (
          <OrderMetaText>
            {formatOrderTotal(
              row.original.totalAmount,
              row.original.currency,
              locale,
              tDashboard("orders_unknown_total")
            )}
          </OrderMetaText>
        ),
      }),
      createColumnHelper<OrdersListItem>().display({
        id: "actions",
        header: () => tDashboard("orders_table_actions"),
        cell: ({ row }) => (
          <Link
            href={`/dashboard/orders/${row.original.id}`}
            className="font-sans inline-flex min-h-10 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 text-[11px] font-semibold whitespace-nowrap tracking-[0.02em] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 lg:min-h-11 lg:text-xs"
          >
            {tDashboard("orders_action_track")}
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
      minWidthClassName="md:min-w-[920px] lg:min-w-[1040px]"
    >
      <Table className="min-w-[920px] border-collapse lg:min-w-[1040px]">
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
                <TableCell className="px-4 py-4">
                  <div className="h-4 w-28 animate-pulse rounded bg-[#2A2A2A]" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="h-4 w-32 animate-pulse rounded bg-[#2A2A2A]" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="h-6 w-24 animate-pulse rounded-full bg-[#2A2A2A]" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-[#2A2A2A]" />
                </TableCell>
                <TableCell className="px-4 py-4 text-right">
                  <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[#2A2A2A]" />
                </TableCell>
                <TableCell className="px-4 py-4 text-right">
                  <div className="ml-auto h-10 w-28 animate-pulse rounded-full bg-[#2A2A2A]" />
                </TableCell>
              </tr>
            ))}
          </TableBody>
        ) : null}
      </Table>
    </DashboardTableViewport>
  );
}

type OrdersMobileCardsProps = {
  items: OrdersListItem[];
  locale: string;
  transitioning: boolean;
  prefersReducedMotion: boolean;
};

function OrdersMobileCards({
  items,
  locale,
  transitioning,
  prefersReducedMotion,
}: OrdersMobileCardsProps) {
  const tDashboard = useTranslations("dashboard");

  return (
    <>
      {items.map((order) => (
        <motion.article
          key={order.id}
          initial={false}
          whileHover={
            prefersReducedMotion ? undefined : { scale: 1.01, backgroundColor: "#151515" }
          }
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <OrderReferenceText>{order.orderNumber}</OrderReferenceText>
            <div className="flex flex-wrap justify-end gap-2">
              <ReprintBadge
                orderType={order.orderType}
                label={tDashboard("orders_reprint_badge")}
              />
              <OrderStatusBadge
                orderStatus={order.orderStatus}
                bookStatus={order.bookStatus}
                label={
                  toStatusLabel(order.bookStatus ?? order.orderStatus) ??
                  tDashboard("orders_unknown_status")
                }
              />
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2">
              <dt className="font-sans text-[11px] leading-none font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("orders_table_package")}
              </dt>
              <dd className="mt-1">
                <OrderMetaText>
                  {order.packageName ?? tDashboard("orders_unknown_package")}
                </OrderMetaText>
              </dd>
            </div>

            <div>
              <dt className="font-sans text-[11px] leading-none font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("orders_table_date")}
              </dt>
              <dd className="mt-1">
                <OrderMetaText>
                  {formatOrderDate(order.createdAt, locale, tDashboard("orders_unknown_date"))}
                </OrderMetaText>
              </dd>
            </div>

            <div className="text-right">
              <dt className="font-sans text-[11px] leading-none font-semibold tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tDashboard("orders_table_total")}
              </dt>
              <dd className="mt-1">
                <OrderMetaText>
                  {formatOrderTotal(
                    order.totalAmount,
                    order.currency,
                    locale,
                    tDashboard("orders_unknown_total")
                  )}
                </OrderMetaText>
              </dd>
            </div>
          </dl>

          <Link
            href={`/dashboard/orders/${order.id}`}
            className="font-sans mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 text-sm font-semibold tracking-[0.02em] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {tDashboard("orders_action_track")}
          </Link>
        </motion.article>
      ))}

      {transitioning
        ? MOBILE_TRANSITION_SKELETON_KEYS.map((skeletonKey) => (
            <div
              key={skeletonKey}
              aria-hidden="true"
              className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4"
            >
              <div className="h-4 w-28 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
                <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
              </div>
              <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-[#2A2A2A]" />
            </div>
          ))
        : null}
    </>
  );
}

function OrdersMobileSkeleton() {
  return (
    <>
      {MOBILE_SKELETON_KEYS.map((skeletonKey) => (
        <div
          key={skeletonKey}
          aria-hidden="true"
          className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-28 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-[#2A2A2A]" />
        </div>
      ))}
    </>
  );
}

function OrdersTableSkeleton() {
  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[920px] lg:min-w-[1040px]">
      <Table className="min-w-[920px] border-collapse lg:min-w-[1040px]">
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
              {TABLE_SKELETON_COLUMN_KEYS.map((columnKey) => (
                <TableCell key={`${rowKey}-${columnKey}`} className="px-4 py-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-[#2A2A2A]" />
                </TableCell>
              ))}
            </tr>
          ))}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

function OrdersEmptyState() {
  const tDashboard = useTranslations("dashboard");

  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <PackageSearch className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {tDashboard("orders_empty_title")}
      </h2>
      <p className="font-sans mt-2 max-w-md text-sm text-[#d0d0d0] md:text-base">
        {tDashboard("orders_empty_description")}
      </p>
      <Link
        href="/pricing"
        className="font-sans mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-6 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
      >
        {tDashboard("orders_empty_cta")}
      </Link>
    </section>
  );
}

type OrdersErrorStateProps = {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
};

function OrdersErrorState({ message, onRetry, isRetrying }: OrdersErrorStateProps) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  return (
    <section className="rounded-2xl border border-[#ef4444]/45 bg-[#111111] p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-[#ef4444]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-white">
            {tDashboard("orders_error_title")}
          </h2>
          <p className="font-sans mt-1 text-sm text-[#d0d0d0]">
            {message || tDashboard("orders_error_description")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="font-sans mt-4 min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-5 text-white hover:bg-[#151515]"
          >
            {isRetrying ? tCommon("loading") : tCommon("retry")}
          </Button>
        </div>
      </div>
    </section>
  );
}

type OrdersPaginationControlsProps = {
  page: number;
  totalPages: number | null;
  canPrevious: boolean;
  canNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

function OrdersPaginationControls({
  page,
  totalPages,
  canPrevious,
  canNext,
  loading,
  onPrevious,
  onNext,
}: OrdersPaginationControlsProps) {
  const tDashboard = useTranslations("dashboard");

  return (
    <nav
      aria-label={tDashboard("orders_pagination_aria")}
      className="flex flex-col gap-3 rounded-2xl border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
        {typeof totalPages === "number" && totalPages > 0
          ? tDashboard("orders_pagination_page_of", { page, totalPages })
          : tDashboard("orders_pagination_page", { page })}
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
          {tDashboard("orders_pagination_previous")}
        </Button>

        <Button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          variant="outline"
          className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 text-xs font-semibold text-white hover:bg-[#151515] disabled:opacity-45"
        >
          {tDashboard("orders_pagination_next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function OrdersView() {
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const [page, setPage] = useState(1);

  const { items, pagination, isError, refetch, isFetching, isInitialLoading, isPageTransitioning } =
    useOrders({
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
  const errorMessage = tDashboard("orders_error_description");

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {tDashboard("orders")}
        </h1>
        <p className="font-sans text-sm text-[#d0d0d0] md:text-base">
          {tDashboard("orders_history_subtitle")}
        </p>
      </header>

      <div aria-live="polite" className="sr-only">
        {isPageTransitioning ? tDashboard("orders_loading_more") : null}
      </div>

      {isError ? (
        <OrdersErrorState
          message={errorMessage}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : isInitialLoading ? (
        <DashboardResponsiveDataRegion
          mobileCards={<OrdersMobileSkeleton />}
          desktopTable={<OrdersTableSkeleton />}
        />
      ) : hasData ? (
        <DashboardResponsiveDataRegion
          mobileCards={
            <OrdersMobileCards
              items={items}
              locale={locale}
              transitioning={isPageTransitioning}
              prefersReducedMotion={prefersReducedMotion}
            />
          }
          desktopTable={
            <OrdersDesktopTable
              items={items}
              locale={locale}
              transitioning={isPageTransitioning}
              prefersReducedMotion={prefersReducedMotion}
            />
          }
        />
      ) : (
        <OrdersEmptyState />
      )}

      {!isError && !isInitialLoading && showPagination ? (
        <OrdersPaginationControls
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
