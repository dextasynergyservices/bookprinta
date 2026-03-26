export type OrderType = "STANDARD" | "REPRINT" | (string & {});

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PENDING_PAYMENT_APPROVAL"
  | "PAID"
  | "PROCESSING"
  | "AWAITING_UPLOAD"
  | "FORMATTING"
  | "ACTION_REQUIRED"
  | "PREVIEW_READY"
  | "PENDING_EXTRA_PAYMENT"
  | "APPROVED"
  | "IN_PRODUCTION"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | (string & {});

export type BookStatus =
  | "AWAITING_UPLOAD"
  | "UPLOADED"
  | "PAYMENT_RECEIVED"
  | "AI_PROCESSING"
  | "DESIGNING"
  | "DESIGNED"
  | "FORMATTING"
  | "FORMATTED"
  | "FORMATTING_REVIEW"
  | "PREVIEW_READY"
  | "REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "IN_PRODUCTION"
  | "PRINTING"
  | "PRINTED"
  | "SHIPPING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | (string & {});

export type OrderLifecycleTone = "active" | "delivered" | "pending" | "issue";

export type OrderLifecycleSource = "order" | "book";

export interface OrdersListItem {
  id: string;
  orderNumber: string;
  packageName: string | null;
  orderType: OrderType;
  orderStatus: OrderStatus | null;
  bookId: string | null;
  bookStatus: BookStatus | null;
  createdAt: string | null;
  totalAmount: number | null;
  currency: string;
}

export interface OrdersListPagination {
  page: number;
  pageSize: number;
  totalItems: number | null;
  totalPages: number | null;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface OrdersListNormalizedResponse {
  items: OrdersListItem[];
  pagination: OrdersListPagination;
}

export interface OrderLifecycleResolution {
  source: OrderLifecycleSource;
  sourceStatus: string | null;
  tone: OrderLifecycleTone;
}
