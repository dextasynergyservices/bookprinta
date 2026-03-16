import type {
  DashboardOverviewResponse,
  DashboardPendingAction,
  NotificationItem,
  ReviewBook,
  UserBookListItem,
} from "@bookprinta/shared";
import { Injectable } from "@nestjs/common";
import { BooksService } from "../books/books.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { ReviewsService } from "../reviews/reviews.service.js";
import { UsersService } from "../users/users.service.js";

@Injectable()
export class DashboardService {
  private static readonly ACTIVE_BOOK_TERMINAL_STATUSES = new Set([
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
  ]);

  constructor(
    private readonly booksService: BooksService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly reviewsService: ReviewsService
  ) {}

  async getUserDashboardOverview(userId: string): Promise<DashboardOverviewResponse> {
    const [books, recentOrders, unreadCount, notificationState, profile, reviewState] =
      await Promise.all([
        this.booksService.findUserBooks(userId, {
          page: 1,
          limit: 10,
        }),
        this.ordersService.findUserOrders(userId, {
          page: 1,
          limit: 3,
        }),
        this.notificationsService.getUnreadCount(userId),
        this.notificationsService.findUserNotifications(userId, {
          page: 1,
          limit: 50,
        }),
        this.usersService.getMyProfile(userId),
        this.reviewsService.getMyReviews(userId),
      ]);

    const activeBook = this.resolveActiveBook(books.items);
    const pendingActionItems = this.buildPendingActions({
      activeBook,
      isProfileComplete: profile.isProfileComplete,
      pendingReviewBook: reviewState.books.find((book) => book.reviewStatus === "PENDING") ?? null,
    });

    return {
      activeBook,
      recentOrders: recentOrders.items,
      notifications: {
        unreadCount: unreadCount.unreadCount,
        hasProductionDelayBanner: this.hasProductionDelayBanner(notificationState.items),
      },
      profile: {
        isProfileComplete: profile.isProfileComplete,
        preferredLanguage: profile.preferredLanguage,
      },
      pendingActions: {
        total: pendingActionItems.length,
        items: pendingActionItems,
      },
    };
  }

  private resolveActiveBook(books: UserBookListItem[]): UserBookListItem | null {
    const activeBook =
      books.find(
        (book) =>
          !DashboardService.ACTIVE_BOOK_TERMINAL_STATUSES.has(book.productionStatus) &&
          !DashboardService.ACTIVE_BOOK_TERMINAL_STATUSES.has(book.status)
      ) ?? books[0];

    return activeBook ?? null;
  }

  private hasProductionDelayBanner(items: NotificationItem[]): boolean {
    return items.some((item) => item.data.presentation?.persistentBanner === "production_delay");
  }

  private buildPendingActions(params: {
    activeBook: UserBookListItem | null;
    isProfileComplete: boolean;
    pendingReviewBook: ReviewBook | null;
  }): DashboardPendingAction[] {
    const actions: DashboardPendingAction[] = [];

    if (!params.isProfileComplete) {
      actions.push({
        type: "COMPLETE_PROFILE",
        priority: "medium",
        href: "/dashboard/profile",
        bookId: null,
        orderId: null,
        bookTitle: null,
        bookStatus: null,
        orderStatus: null,
      });
    }

    if (params.pendingReviewBook) {
      actions.push({
        type: "REVIEW_BOOK",
        priority: "medium",
        href: "/dashboard/reviews",
        bookId: params.pendingReviewBook.bookId,
        orderId: null,
        bookTitle: params.pendingReviewBook.title,
        bookStatus: params.pendingReviewBook.lifecycleStatus,
        orderStatus: null,
      });
    }

    const activeBookAction = this.resolveActiveBookPendingAction(params.activeBook);
    if (activeBookAction) {
      actions.push(activeBookAction);
    }

    return actions.sort((left, right) => {
      const priorityScore = this.priorityScore(left.priority) - this.priorityScore(right.priority);
      if (priorityScore !== 0) return priorityScore;
      return left.href.localeCompare(right.href);
    });
  }

  private resolveActiveBookPendingAction(
    activeBook: UserBookListItem | null
  ): DashboardPendingAction | null {
    if (!activeBook) {
      return null;
    }

    if (activeBook.orderStatus === "PENDING_EXTRA_PAYMENT") {
      return {
        type: "PAY_EXTRA_PAGES",
        priority: "high",
        href: activeBook.workspaceUrl,
        bookId: activeBook.id,
        orderId: activeBook.orderId,
        bookTitle: activeBook.title,
        bookStatus: activeBook.status,
        orderStatus: activeBook.orderStatus,
      };
    }

    if (activeBook.status === "PREVIEW_READY") {
      return {
        type: "REVIEW_PREVIEW",
        priority: "high",
        href: activeBook.workspaceUrl,
        bookId: activeBook.id,
        orderId: activeBook.orderId,
        bookTitle: activeBook.title,
        bookStatus: activeBook.status,
        orderStatus: activeBook.orderStatus,
      };
    }

    if (activeBook.status === "REJECTED" || activeBook.status === "FORMATTING_REVIEW") {
      return {
        type: "RESOLVE_MANUSCRIPT_ISSUE",
        priority: "high",
        href: activeBook.workspaceUrl,
        bookId: activeBook.id,
        orderId: activeBook.orderId,
        bookTitle: activeBook.title,
        bookStatus: activeBook.status,
        orderStatus: activeBook.orderStatus,
      };
    }

    if (
      activeBook.wordCount === null &&
      (activeBook.status === "AWAITING_UPLOAD" || activeBook.status === "PAYMENT_RECEIVED")
    ) {
      return {
        type: "UPLOAD_MANUSCRIPT",
        priority: "high",
        href: activeBook.workspaceUrl,
        bookId: activeBook.id,
        orderId: activeBook.orderId,
        bookTitle: activeBook.title,
        bookStatus: activeBook.status,
        orderStatus: activeBook.orderStatus,
      };
    }

    return null;
  }

  private priorityScore(priority: DashboardPendingAction["priority"]): number {
    if (priority === "high") return 0;
    if (priority === "medium") return 1;
    return 2;
  }
}
