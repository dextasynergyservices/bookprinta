import type {
  OrderLifecycleResolution,
  OrderLifecycleTone,
  OrdersListItem,
  OrdersListNormalizedResponse,
} from "@/types/orders";

const ORDER_ISSUE_STATUSES = new Set(["ACTION_REQUIRED", "CANCELLED", "REFUNDED"]);
const BOOK_ISSUE_STATUSES = new Set(["REJECTED", "CANCELLED"]);

const ORDER_PENDING_STATUSES = new Set([
  "PENDING_PAYMENT",
  "PENDING_PAYMENT_APPROVAL",
  "AWAITING_UPLOAD",
  "PENDING_EXTRA_PAYMENT",
]);
const BOOK_PENDING_STATUSES = new Set([
  "AWAITING_UPLOAD",
  "UPLOADED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
]);

const ORDER_DELIVERED_STATUSES = new Set(["COMPLETED"]);
const BOOK_DELIVERED_STATUSES = new Set(["DELIVERED", "COMPLETED"]);

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value;
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function toPositiveInt(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.trunc(parsed));
}

function normalizeStatus(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  return raw.replace(/[\s-]+/g, "_").toUpperCase();
}

function normalizeOrderType(value: unknown): string {
  const normalized = normalizeStatus(value);
  return normalized ?? "STANDARD";
}

function resolveItemsContainer(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const root = toRecord(payload);
  if (!root) return [];

  const data = toRecord(root.data);
  const pagination = toRecord(root.pagination);
  const meta = toRecord(root.meta);

  const candidateArrays: unknown[] = [
    root.items,
    root.orders,
    root.results,
    data?.items,
    data?.orders,
    data?.results,
    data?.rows,
    pagination?.items,
    meta?.items,
    root.data,
  ];

  for (const candidate of candidateArrays) {
    const list = toArray(candidate);
    if (list) return list;
  }

  return [];
}

function normalizeOrderItem(value: unknown): OrdersListItem | null {
  const row = toRecord(value);
  if (!row) return null;

  const packageRecord = toRecord(row.package);
  const orderRecord = toRecord(row.order);
  const bookRecord = toRecord(row.book);

  const id = toStringValue(row.id) ?? toStringValue(row.orderId) ?? toStringValue(orderRecord?.id);
  if (!id) return null;

  const orderNumber =
    toStringValue(row.orderNumber) ??
    toStringValue(row.orderRef) ??
    toStringValue(row.reference) ??
    toStringValue(orderRecord?.orderNumber) ??
    id;

  const packageName =
    toStringValue(packageRecord?.name) ??
    toStringValue(row.packageName) ??
    toStringValue(row.tier) ??
    null;

  return {
    id,
    orderNumber,
    packageName,
    orderType: normalizeOrderType(row.orderType),
    orderStatus: normalizeStatus(row.orderStatus ?? row.status ?? orderRecord?.status),
    bookId: toStringValue(row.bookId) ?? toStringValue(bookRecord?.id) ?? null,
    bookStatus: normalizeStatus(row.bookStatus ?? bookRecord?.status),
    createdAt:
      toStringValue(row.createdAt) ??
      toStringValue(row.orderDate) ??
      toStringValue(row.date) ??
      null,
    totalAmount:
      toNumber(row.totalAmount) ??
      toNumber(row.amountPaid) ??
      toNumber(row.totalPaid) ??
      toNumber(row.amount) ??
      null,
    currency:
      toStringValue(row.currency) ??
      toStringValue(row.totalCurrency) ??
      toStringValue(orderRecord?.currency) ??
      "NGN",
  };
}

function resolvePagination(payload: unknown, requestedPage: number, requestedPageSize: number) {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const rootMeta = toRecord(root?.meta);
  const dataMeta = toRecord(data?.meta);
  const rootPagination = toRecord(root?.pagination);
  const dataPagination = toRecord(data?.pagination);
  const paginationLike = rootPagination ?? dataPagination ?? rootMeta ?? dataMeta;

  const page =
    toPositiveInt(paginationLike?.page) ??
    toPositiveInt(paginationLike?.currentPage) ??
    toPositiveInt(root?.page) ??
    toPositiveInt(data?.page) ??
    requestedPage;

  const pageSize =
    toPositiveInt(paginationLike?.pageSize) ??
    toPositiveInt(paginationLike?.limit) ??
    toPositiveInt(paginationLike?.perPage) ??
    toPositiveInt(root?.pageSize) ??
    toPositiveInt(root?.limit) ??
    requestedPageSize;

  const totalItems =
    toPositiveInt(paginationLike?.totalItems) ??
    toPositiveInt(paginationLike?.total) ??
    toPositiveInt(paginationLike?.count) ??
    toPositiveInt(root?.totalItems) ??
    toPositiveInt(root?.total) ??
    toPositiveInt(data?.totalItems) ??
    null;

  const totalPages =
    toPositiveInt(paginationLike?.totalPages) ??
    toPositiveInt(paginationLike?.pageCount) ??
    toPositiveInt(root?.totalPages) ??
    toPositiveInt(data?.totalPages) ??
    (totalItems !== null && pageSize > 0 ? Math.max(1, Math.ceil(totalItems / pageSize)) : null);

  const nextCursor =
    toStringValue(root?.nextCursor) ??
    toStringValue(data?.nextCursor) ??
    toStringValue(paginationLike?.nextCursor) ??
    null;

  const hasNextPage =
    toBoolean(paginationLike?.hasNextPage) ??
    toBoolean(paginationLike?.hasNext) ??
    toBoolean(root?.hasNextPage) ??
    toBoolean(root?.hasMore) ??
    (nextCursor !== null
      ? true
      : totalPages !== null
        ? page < totalPages
        : totalItems !== null
          ? page * pageSize < totalItems
          : false);

  const hasPreviousPage =
    toBoolean(paginationLike?.hasPreviousPage) ??
    toBoolean(paginationLike?.hasPrevPage) ??
    toBoolean(root?.hasPreviousPage) ??
    page > 1;

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage,
    hasNextPage,
    nextCursor,
  };
}

export function normalizeOrdersListPayload(
  payload: unknown,
  options: { requestedPage?: number; requestedPageSize?: number } = {}
): OrdersListNormalizedResponse {
  const requestedPage = Math.max(1, options.requestedPage ?? 1);
  const requestedPageSize = Math.max(1, options.requestedPageSize ?? 10);

  const items = resolveItemsContainer(payload)
    .map(normalizeOrderItem)
    .filter((item): item is OrdersListItem => item !== null);

  return {
    items,
    pagination: resolvePagination(payload, requestedPage, requestedPageSize),
  };
}

function resolveStatusTone(
  status: string | null,
  source: "order" | "book"
): OrderLifecycleTone | null {
  if (!status) return null;

  if (source === "order") {
    if (ORDER_ISSUE_STATUSES.has(status)) return "issue";
    if (ORDER_DELIVERED_STATUSES.has(status)) return "delivered";
    if (ORDER_PENDING_STATUSES.has(status)) return "pending";
    return "active";
  }

  if (BOOK_ISSUE_STATUSES.has(status)) return "issue";
  if (BOOK_DELIVERED_STATUSES.has(status)) return "delivered";
  if (BOOK_PENDING_STATUSES.has(status)) return "pending";
  return "active";
}

/**
 * Status source rule for dashboard order history:
 * - Book status is the source of truth when present (it includes DELIVERED).
 * - Order status is a fallback when no book status is available.
 * - Order-level issue statuses (ACTION_REQUIRED/CANCELLED/REFUNDED) still take precedence.
 */
export function resolveOrderLifecycle(item: {
  orderStatus: unknown;
  bookStatus: unknown;
}): OrderLifecycleResolution {
  const orderStatus = normalizeStatus(item.orderStatus);
  const bookStatus = normalizeStatus(item.bookStatus);

  const orderTone = resolveStatusTone(orderStatus, "order");
  const bookTone = resolveStatusTone(bookStatus, "book");

  if (orderTone === "issue") {
    return { source: "order", sourceStatus: orderStatus, tone: "issue" };
  }

  if (bookStatus !== null) {
    return {
      source: "book",
      sourceStatus: bookStatus,
      tone: bookTone ?? "active",
    };
  }

  return {
    source: "order",
    sourceStatus: orderStatus,
    tone: orderTone ?? "active",
  };
}

export function isReprintOrderType(orderType: unknown): boolean {
  const normalized = normalizeOrderType(orderType);
  return normalized === "REPRINT_SAME" || normalized === "REPRINT_REVISED";
}
