import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import type { BookStatus, ProductionDelayEventSource } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  DEFAULT_PRODUCTION_BACKLOG_THRESHOLD,
  DEFAULT_PRODUCTION_DELAY_ACTIVE,
  DEFAULT_PRODUCTION_DELAY_OVERRIDE_STATE,
  isProductionDelayOverrideState,
  PRODUCTION_BACKLOG_THRESHOLD_SYSTEM_SETTING_KEY,
  PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY,
  PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY,
  type ProductionDelayOverrideState,
} from "./production-delay.constants.js";
import {
  PRODUCTION_DELAY_ACTIVE_BACKLOG_BOOK_STATUSES,
  resolveProductionDelayLifecycleStatus,
} from "./production-delay-status.js";

const PRODUCTION_DELAY_STATUS_SETTING_KEYS = [
  PRODUCTION_BACKLOG_THRESHOLD_SYSTEM_SETTING_KEY,
  PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY,
  PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY,
] as const;

type ProductionDelayReadExecutor = Pick<
  PrismaService,
  "systemSetting" | "productionDelayEvent" | "book"
>;

const ACTIVE_DELAY_EVENT_SELECT = {
  id: true,
  source: true,
  activatedAt: true,
} as const;

const AFFECTED_BOOK_SELECT = {
  id: true,
  orderId: true,
  userId: true,
  status: true,
  productionStatus: true,
  title: true,
  user: {
    select: {
      email: true,
      firstName: true,
      preferredLanguage: true,
    },
  },
  order: {
    select: {
      customQuote: {
        select: {
          workingTitle: true,
        },
      },
    },
  },
  files: {
    where: {
      fileType: "RAW_MANUSCRIPT",
    },
    orderBy: [{ version: "desc" }],
    select: {
      fileName: true,
    },
    take: 1,
  },
} satisfies Prisma.BookSelect;

type ActiveDelayEventRow = Prisma.ProductionDelayEventGetPayload<{
  select: typeof ACTIVE_DELAY_EVENT_SELECT;
}>;

type AffectedBookRow = Prisma.BookGetPayload<{ select: typeof AFFECTED_BOOK_SELECT }>;

export type ProductionDelayAffectedBook = {
  bookId: string;
  orderId: string;
  userId: string;
  title: string | null;
  lifecycleStatus: BookStatus;
};

export type ProductionDelayAffectedUser = {
  userId: string;
  email: string;
  firstName: string;
  preferredLanguage: string;
  books: ProductionDelayAffectedBook[];
};

export type ProductionDelayActiveEventSnapshot = {
  id: string;
  source: ProductionDelayEventSource;
  activatedAt: string;
};

export type ProductionDelayStatusResolution = {
  threshold: number;
  backlogCount: number;
  autoDelayActive: boolean;
  persistedDelayActive: boolean;
  manualOverrideState: ProductionDelayOverrideState;
  isDelayActive: boolean;
  resolvedDelayStateSource: "auto" | "manual_override" | "none";
  activeEvent: ProductionDelayActiveEventSnapshot | null;
  affectedBooks: ProductionDelayAffectedBook[];
  affectedUsers: ProductionDelayAffectedUser[];
};

@Injectable()
export class ProductionDelayService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveStatus(
    executor: ProductionDelayReadExecutor = this.prisma
  ): Promise<ProductionDelayStatusResolution> {
    const [settings, activeEvent, affectedBookRows] = await Promise.all([
      executor.systemSetting.findMany({
        where: {
          key: { in: [...PRODUCTION_DELAY_STATUS_SETTING_KEYS] },
        },
        select: {
          key: true,
          value: true,
        },
      }),
      executor.productionDelayEvent.findFirst({
        where: {
          status: "ACTIVE",
        },
        orderBy: [{ activatedAt: "desc" }, { id: "desc" }],
        select: ACTIVE_DELAY_EVENT_SELECT,
      }),
      executor.book.findMany({
        where: this.buildAffectedBooksWhere(),
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: AFFECTED_BOOK_SELECT,
      }) as Promise<AffectedBookRow[]>,
    ]);

    const settingMap = new Map(settings.map((row) => [row.key, row.value]));
    const threshold = this.parsePositiveIntegerSetting(
      settingMap.get(PRODUCTION_BACKLOG_THRESHOLD_SYSTEM_SETTING_KEY),
      DEFAULT_PRODUCTION_BACKLOG_THRESHOLD
    );
    const persistedDelayActive = this.parseBooleanSetting(
      settingMap.get(PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY),
      DEFAULT_PRODUCTION_DELAY_ACTIVE
    );
    const manualOverrideState = this.parseOverrideSetting(
      settingMap.get(PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY)
    );
    const affectedBooks = affectedBookRows.map((row) => this.serializeAffectedBook(row));
    const affectedUsers = this.groupAffectedUsers(affectedBookRows, affectedBooks);
    const backlogCount = affectedBooks.length;
    const autoDelayActive = backlogCount >= threshold;
    const isDelayActive = this.resolveEffectiveDelayState({
      autoDelayActive,
      manualOverrideState,
    });
    const resolvedDelayStateSource = this.resolveDelayStateSource({
      autoDelayActive,
      manualOverrideState,
    });

    return {
      threshold,
      backlogCount,
      autoDelayActive,
      persistedDelayActive,
      manualOverrideState,
      isDelayActive,
      resolvedDelayStateSource,
      activeEvent: activeEvent ? this.serializeActiveEvent(activeEvent) : null,
      affectedBooks,
      affectedUsers,
    };
  }

  private buildAffectedBooksWhere(): Prisma.BookWhereInput {
    const activeStatuses = [...PRODUCTION_DELAY_ACTIVE_BACKLOG_BOOK_STATUSES];

    return {
      OR: [
        { productionStatus: { in: activeStatuses } },
        {
          productionStatus: null,
          status: { in: activeStatuses },
        },
      ],
    };
  }

  private serializeAffectedBook(row: AffectedBookRow): ProductionDelayAffectedBook {
    return {
      bookId: row.id,
      orderId: row.orderId,
      userId: row.userId,
      title: this.resolveBookTitle(row),
      lifecycleStatus: resolveProductionDelayLifecycleStatus({
        manuscriptStatus: row.status as BookStatus,
        productionStatus: row.productionStatus as BookStatus | null,
      }),
    };
  }

  private groupAffectedUsers(
    rows: AffectedBookRow[],
    books: ProductionDelayAffectedBook[]
  ): ProductionDelayAffectedUser[] {
    const booksById = new Map(books.map((book) => [book.bookId, book]));
    const grouped = new Map<string, ProductionDelayAffectedUser>();

    for (const row of rows) {
      const book = booksById.get(row.id);
      if (!book) continue;

      const existing = grouped.get(row.userId);
      if (existing) {
        existing.books.push(book);
        continue;
      }

      grouped.set(row.userId, {
        userId: row.userId,
        email: row.user.email,
        firstName: row.user.firstName,
        preferredLanguage: row.user.preferredLanguage,
        books: [book],
      });
    }

    return Array.from(grouped.values());
  }

  private resolveBookTitle(row: AffectedBookRow): string | null {
    const storedTitle = this.normalizeString(row.title);
    if (storedTitle) return storedTitle;

    const quoteTitle = this.normalizeString(row.order.customQuote?.workingTitle ?? null);
    if (quoteTitle) return quoteTitle;

    return this.deriveTitleFromFileName(row.files[0]?.fileName ?? null);
  }

  private deriveTitleFromFileName(fileName: string | null | undefined): string | null {
    const trimmed = this.normalizeString(fileName);
    if (!trimmed) return null;

    const normalized = trimmed
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return normalized.length > 0 ? normalized : null;
  }

  private normalizeString(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parsePositiveIntegerSetting(value: string | undefined, fallback: number): number {
    if (value == null) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private parseBooleanSetting(value: string | undefined, fallback: boolean): boolean {
    if (value == null) return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;

    return fallback;
  }

  private parseOverrideSetting(value: string | undefined): ProductionDelayOverrideState {
    if (!isProductionDelayOverrideState(value)) {
      return DEFAULT_PRODUCTION_DELAY_OVERRIDE_STATE;
    }

    return value;
  }

  private resolveEffectiveDelayState(params: {
    autoDelayActive: boolean;
    manualOverrideState: ProductionDelayOverrideState;
  }): boolean {
    if (params.manualOverrideState === "force_active") return true;
    if (params.manualOverrideState === "force_inactive") return false;
    return params.autoDelayActive;
  }

  private resolveDelayStateSource(params: {
    autoDelayActive: boolean;
    manualOverrideState: ProductionDelayOverrideState;
  }): "auto" | "manual_override" | "none" {
    if (params.manualOverrideState !== "auto") {
      return "manual_override";
    }

    return params.autoDelayActive ? "auto" : "none";
  }

  private serializeActiveEvent(event: ActiveDelayEventRow): ProductionDelayActiveEventSnapshot {
    return {
      id: event.id,
      source: event.source,
      activatedAt: event.activatedAt.toISOString(),
    };
  }
}
