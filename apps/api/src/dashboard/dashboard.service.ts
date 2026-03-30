import type {
  CreateQuoteInput,
  CreateQuoteResponse,
  DashboardNewBookOrderInput,
  DashboardNewBookOrderResponse,
  DashboardNewBookPricingResponse,
  DashboardOverviewResponse,
  DashboardPendingAction,
  NotificationItem,
  PackageCategoryResponse,
  ReviewBook,
  UserBookListItem,
} from "@bookprinta/shared";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BooksService } from "../books/books.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { PackagesService } from "../packages/packages.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import { QuotesService } from "../quotes/quotes.service.js";
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
    private readonly reviewsService: ReviewsService,
    private readonly packagesService: PackagesService,
    private readonly paymentsService: PaymentsService,
    private readonly quotesService: QuotesService
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

    // Check if the active book already has an in-progress reprint so we
    // don't surface a misleading "Reprint Available" action.
    const activeBookHasReprint =
      activeBook !== null &&
      DashboardService.ACTIVE_BOOK_TERMINAL_STATUSES.has(activeBook.productionStatus) &&
      activeBook.productionStatus !== "CANCELLED"
        ? await this.booksService.hasActiveReprint(activeBook.id)
        : false;

    const pendingActionItems = this.buildPendingActions({
      activeBook,
      activeBookHasReprint,
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
    // 1. Prefer the most recently CREATED delivered/completed book.
    //    The books list is sorted by updatedAt desc (from the query), but when
    //    a user has multiple delivered books we want to surface the newest
    //    project — the one created last, not the one updated last.
    const deliveredBooks = books.filter(
      (book) =>
        book.productionStatus === "DELIVERED" ||
        book.productionStatus === "COMPLETED" ||
        book.status === "DELIVERED" ||
        book.status === "COMPLETED"
    );

    if (deliveredBooks.length > 0) {
      return deliveredBooks.reduce((newest, book) =>
        new Date(book.createdAt).getTime() > new Date(newest.createdAt).getTime() ? book : newest
      );
    }

    // 2. Next, prefer the first in-progress (non-terminal) book
    const inProgressBook = books.find(
      (book) =>
        !DashboardService.ACTIVE_BOOK_TERMINAL_STATUSES.has(book.productionStatus) &&
        !DashboardService.ACTIVE_BOOK_TERMINAL_STATUSES.has(book.status)
    );

    return inProgressBook ?? books[0] ?? null;
  }

  private hasProductionDelayBanner(items: NotificationItem[]): boolean {
    return items.some((item) => item.data.presentation?.persistentBanner === "production_delay");
  }

  private buildPendingActions(params: {
    activeBook: UserBookListItem | null;
    activeBookHasReprint: boolean;
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

    // Add reprint action for delivered/completed active book only when
    // there is no reprint already in progress for that book.
    if (
      params.activeBook &&
      !params.activeBookHasReprint &&
      DashboardService.ACTIVE_BOOK_TERMINAL_STATUSES.has(params.activeBook.productionStatus) &&
      params.activeBook.productionStatus !== "CANCELLED"
    ) {
      actions.push({
        type: "REPRINT_AVAILABLE",
        priority: "low",
        href: `/dashboard/books/${params.activeBook.id}?reprint=same`,
        bookId: params.activeBook.id,
        orderId: params.activeBook.orderId,
        bookTitle: params.activeBook.title,
        bookStatus: params.activeBook.productionStatus,
        orderStatus: params.activeBook.orderStatus,
      });
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

  // ──────────────────────────────────────────────
  // Print a New Book
  // ──────────────────────────────────────────────

  /**
   * GET /dashboard/new-book
   * Returns the same package categories + nested packages as the public pricing page.
   */
  async getNewBookPricing(): Promise<DashboardNewBookPricingResponse> {
    const categories: PackageCategoryResponse[] =
      await this.packagesService.findAllActiveByCategory();
    return { categories };
  }

  /**
   * POST /dashboard/new-book/order
   * Initializes a payment for a new book order placed by an authenticated user.
   * Injects `source: "dashboard"` and `dashboardUserId` into metadata so the
   * webhook handler skips user creation and sends the correct emails.
   */
  async createNewBookOrder(
    userId: string,
    dto: DashboardNewBookOrderInput
  ): Promise<DashboardNewBookOrderResponse> {
    // Resolve user for email + name
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Validate package exists and is active
    const pkg = await this.packagesService.findActiveById(dto.packageId);
    if (!pkg) {
      throw new BadRequestException("Selected package does not exist or is inactive.");
    }

    // Build metadata (same structure as public checkout, plus dashboard identifiers)
    const metadata: Record<string, unknown> = {
      source: "dashboard",
      dashboardUserId: userId,
      paymentFlow: "CHECKOUT",
      locale: user.preferredLanguage ?? "en",
      fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      phone: user.phoneNumber ?? null,
      packageId: pkg.id,
      packageSlug: pkg.slug,
      packageName: pkg.name,
      hasCover: dto.hasCoverDesign,
      hasFormatting: dto.hasFormatting,
      bookSize: dto.bookSize,
      paperColor: dto.paperColor,
      lamination: dto.lamination,
      basePrice: dto.basePrice,
      addonTotal: dto.addonTotal,
      totalPrice: dto.totalPrice,
      couponCode: dto.couponCode ?? null,
      addons: dto.addons.map((addon) => ({
        id: addon.id,
        slug: addon.slug ?? null,
        name: addon.name ?? null,
        price: addon.price,
        wordCount: addon.wordCount ?? null,
      })),
    };

    // Bank transfer path
    if (dto.provider === "BANK_TRANSFER") {
      const result = await this.paymentsService.submitDashboardBankTransfer({
        userId,
        payerName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        payerEmail: user.email,
        payerPhone: user.phoneNumber ?? "",
        amount: dto.totalPrice,
        currency: DEFAULT_CURRENCY,
        receiptUrl: dto.receiptUrl,
        metadata,
      });

      return {
        type: "bank_transfer" as const,
        message: result.message,
        paymentId: result.id,
      };
    }

    // Online payment path (Paystack / Stripe / PayPal)
    const result = await this.paymentsService.initialize({
      provider: dto.provider as "PAYSTACK" | "STRIPE" | "PAYPAL",
      email: user.email,
      amount: dto.totalPrice,
      currency: DEFAULT_CURRENCY,
      callbackUrl: dto.callbackUrl,
      metadata,
    });

    return {
      type: "redirect" as const,
      authorizationUrl: result.authorizationUrl,
      accessCode: result.accessCode,
      reference: result.reference,
      provider: result.provider,
    };
  }

  /**
   * Submit a custom quote from the dashboard.
   * Skips reCAPTCHA and links the quote to the authenticated user.
   */
  async submitDashboardQuote(
    userId: string,
    dto: CreateQuoteInput,
    context: { ip: string; acceptLanguage?: string; nextLocale?: string }
  ): Promise<CreateQuoteResponse> {
    return this.quotesService.create(dto, {
      ...context,
      userId,
      skipRecaptcha: true,
    });
  }
}
