import type {
  AdminAuditLogsQuery,
  AdminAuditLogsResponse,
  AdminErrorLogActionBodyInput,
  AdminErrorLogActionResponse,
  AdminErrorLogItem,
  AdminErrorLogSeverity,
  AdminErrorLogStatus,
  AdminErrorLogsQuery,
  AdminErrorLogsResponse,
} from "@bookprinta/shared";
import { AdminErrorLogActionBodySchema, AdminErrorLogsQuerySchema } from "@bookprinta/shared";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const ERROR_LOG_STATE_PREFIX = "error_log_state:";
const ERROR_LOG_ENTITY_TYPES = ["SYSTEM_ERROR_LOG", "SENTRY_ISSUE"] as const;

type ErrorLogState = {
  status: AdminErrorLogStatus;
  ownerUserId: string | null;
  ownerName: string | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string;
};

@Injectable()
export class AdminSystemLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(query: AdminAuditLogsQuery): Promise<AdminAuditLogsResponse> {
    const where = this.buildAuditWhere(query);

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const totalItems = await this.prisma.auditLog.count({ where });
    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => ({
        id: row.id,
        timestamp: row.createdAt.toISOString(),
        action: row.action,
        actorUserId: row.userId,
        actorName: this.formatActorName(row.user?.firstName, row.user?.lastName, row.user?.email),
        entityType: row.entityType,
        entityId: row.entityId,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        details: this.toRecord(row.details),
      })),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
      totalItems,
      limit: query.limit,
    };
  }

  async listErrorLogs(rawQuery: AdminErrorLogsQuery): Promise<AdminErrorLogsResponse> {
    const query = AdminErrorLogsQuerySchema.parse(rawQuery);
    const [localEvents, stateRows, sentryEvents] = await Promise.all([
      this.fetchLocalErrorEvents(),
      this.fetchErrorLogStates(),
      this.fetchSentryIssueEvents(),
    ]);

    const mergedByFingerprint = new Map<string, AdminErrorLogItem>();

    for (const item of [...localEvents, ...sentryEvents]) {
      const existing = mergedByFingerprint.get(item.fingerprint);
      if (!existing) {
        mergedByFingerprint.set(item.fingerprint, item);
        continue;
      }

      if (new Date(item.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
        mergedByFingerprint.set(item.fingerprint, item);
      }
    }

    const merged = Array.from(mergedByFingerprint.values()).map((item) => {
      const state = stateRows.get(item.fingerprint);
      if (!state) {
        return item;
      }

      return {
        ...item,
        status: state.status,
        ownerUserId: state.ownerUserId,
        ownerName: state.ownerName,
        metadata: {
          ...(item.metadata ?? {}),
          adminNote: state.note,
          stateUpdatedAt: state.updatedAt,
          stateUpdatedBy: state.updatedBy,
        },
      };
    });

    const filtered = merged.filter((item) => {
      if (query.severity && item.severity !== query.severity) {
        return false;
      }

      if (query.status && item.status !== query.status) {
        return false;
      }

      if (query.service && item.service.toLowerCase() !== query.service.toLowerCase()) {
        return false;
      }

      if (query.ownerUserId && item.ownerUserId !== query.ownerUserId) {
        return false;
      }

      if (
        query.dateFrom &&
        new Date(item.timestamp).getTime() < new Date(query.dateFrom).getTime()
      ) {
        return false;
      }

      if (query.dateTo && new Date(item.timestamp).getTime() > new Date(query.dateTo).getTime()) {
        return false;
      }

      if (query.q) {
        const term = query.q.toLowerCase();
        const blob = [
          item.message,
          item.service,
          item.fingerprint,
          item.environment,
          item.ownerName ?? "",
          JSON.stringify(item.metadata ?? {}),
        ]
          .join(" ")
          .toLowerCase();

        if (!blob.includes(term)) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((left, right) => {
      const leftTs = new Date(left.timestamp).getTime();
      const rightTs = new Date(right.timestamp).getTime();
      if (leftTs !== rightTs) {
        return rightTs - leftTs;
      }

      return right.id.localeCompare(left.id);
    });

    const startIndex = query.cursor
      ? Math.max(0, filtered.findIndex((item) => item.id === query.cursor) + 1)
      : 0;

    const sliced = filtered.slice(startIndex, startIndex + query.limit + 1);
    const hasMore = sliced.length > query.limit;
    const pageItems = hasMore ? sliced.slice(0, query.limit) : sliced;

    return {
      items: pageItems,
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
      totalItems: filtered.length,
      limit: query.limit,
    };
  }

  async applyErrorLogAction(
    fingerprint: string,
    rawInput: AdminErrorLogActionBodyInput,
    adminId: string
  ): Promise<AdminErrorLogActionResponse> {
    const input = AdminErrorLogActionBodySchema.parse(rawInput);
    const key = this.errorLogStateKey(fingerprint);
    const previous = await this.prisma.systemSetting.findUnique({ where: { key } });
    const current = this.parseStateValue(previous?.value);

    let ownerUserId = current?.ownerUserId ?? null;
    let ownerName = current?.ownerName ?? null;
    let note = current?.note ?? null;
    let status: AdminErrorLogStatus = current?.status ?? "open";

    if (input.action === "acknowledge") {
      status = "acknowledged";
    }

    if (input.action === "mark_resolved") {
      status = "resolved";
    }

    if (input.action === "attach_note") {
      note = input.note?.trim() ?? null;
    }

    if (input.action === "assign_owner") {
      ownerUserId = input.ownerUserId ?? null;
      if (ownerUserId) {
        const owner = await this.prisma.user.findUnique({
          where: { id: ownerUserId },
          select: { firstName: true, lastName: true, email: true },
        });
        ownerName = this.formatActorName(owner?.firstName, owner?.lastName, owner?.email);
      } else {
        ownerName = null;
      }
    }

    const updatedAt = new Date().toISOString();
    const nextState: ErrorLogState = {
      status,
      ownerUserId,
      ownerName,
      note,
      updatedAt,
      updatedBy: adminId,
    };

    await this.prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: JSON.stringify(nextState),
        description: "Admin-managed error log state",
        updatedBy: adminId,
      },
      create: {
        key,
        value: JSON.stringify(nextState),
        description: "Admin-managed error log state",
        updatedBy: adminId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "ADMIN_ERROR_LOG_ACTION_APPLIED",
        entityType: "SYSTEM_ERROR_LOG",
        entityId: this.sanitizeId(fingerprint),
        details: {
          fingerprint,
          action: input.action,
          ownerUserId,
          ownerName,
          note,
          status,
        },
      },
    });

    return {
      id: this.sanitizeId(fingerprint),
      fingerprint: this.sanitizeFingerprint(fingerprint),
      status,
      ownerUserId,
      ownerName,
      note,
      updatedAt,
      updatedBy: adminId,
      actionApplied: input.action,
    };
  }

  private buildAuditWhere(query: AdminAuditLogsQuery): Prisma.AuditLogWhereInput {
    const andFilters: Prisma.AuditLogWhereInput[] = [];

    if (query.action) {
      andFilters.push({
        action: { contains: query.action.trim(), mode: "insensitive" },
      });
    }

    if (query.userId) {
      andFilters.push({ userId: query.userId });
    }

    if (query.entityType) {
      andFilters.push({
        entityType: { contains: query.entityType.trim(), mode: "insensitive" },
      });
    }

    if (query.entityId) {
      andFilters.push({
        entityId: { contains: query.entityId.trim(), mode: "insensitive" },
      });
    }

    if (query.dateFrom || query.dateTo) {
      andFilters.push({
        createdAt: {
          ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
          ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
        },
      });
    }

    if (query.q) {
      const q = query.q.trim();
      andFilters.push({
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { entityType: { contains: q, mode: "insensitive" } },
          { entityId: { contains: q, mode: "insensitive" } },
          { ipAddress: { contains: q, mode: "insensitive" } },
          { userAgent: { contains: q, mode: "insensitive" } },
          {
            user: {
              is: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      });
    }

    if (andFilters.length === 0) {
      return {};
    }

    return { AND: andFilters };
  }

  private async fetchLocalErrorEvents(): Promise<AdminErrorLogItem[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [{ entityType: { in: [...ERROR_LOG_ENTITY_TYPES] } }, { action: "SYSTEM_ERROR_EVENT" }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });

    return rows.map((row) => {
      const details = this.toRecord(row.details) ?? {};
      const fingerprint = this.sanitizeFingerprint(
        this.toStringValue(details.fingerprint) ?? row.entityId ?? row.id
      );

      const severity = this.normalizeSeverity(this.toStringValue(details.severity));
      const service =
        this.toStringValue(details.service) ?? this.toStringValue(details.module) ?? "api";
      const message =
        this.toStringValue(details.message) ?? this.toStringValue(details.error) ?? row.action;

      const environment =
        this.toStringValue(details.environment) ?? process.env.NODE_ENV ?? "development";

      return {
        id: this.sanitizeId(fingerprint),
        timestamp:
          this.toStringValue(details.timestamp) &&
          this.isIsoDate(this.toStringValue(details.timestamp))
            ? (this.toStringValue(details.timestamp) as string)
            : row.createdAt.toISOString(),
        severity,
        status: "open",
        service,
        message,
        fingerprint,
        environment,
        ownerUserId: null,
        ownerName: null,
        suggestedAction: this.toNullableString(details.suggestedAction),
        metadata: details,
      };
    });
  }

  private async fetchSentryIssueEvents(): Promise<AdminErrorLogItem[]> {
    const authToken = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG;
    const project = process.env.SENTRY_PROJECT;

    if (!authToken || !org || !project) {
      return [];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(
        `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?limit=50&query=is:unresolved`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        return [];
      }

      const issues = (await response.json()) as Array<Record<string, unknown>>;

      return issues.map((issue) => {
        const id = this.toStringValue(issue.id) ?? this.toStringValue(issue.shortId) ?? "sentry";
        const issueFingerprint =
          Array.isArray(issue.fingerprint) && issue.fingerprint.length > 0
            ? this.toStringValue(issue.fingerprint[0])
            : null;

        const fingerprint = this.sanitizeFingerprint(issueFingerprint ?? `sentry-${id}`);
        const level = this.toStringValue(issue.level);

        return {
          id: this.sanitizeId(fingerprint),
          timestamp:
            this.toStringValue(issue.lastSeen) && this.isIsoDate(this.toStringValue(issue.lastSeen))
              ? (this.toStringValue(issue.lastSeen) as string)
              : new Date().toISOString(),
          severity: this.normalizeSeverity(level),
          status: this.toStringValue(issue.status) === "resolved" ? "resolved" : "open",
          service:
            this.toStringValue(issue.culprit) ??
            this.toStringValue(issue.project?.toString()) ??
            "sentry",
          message: this.toStringValue(issue.title) ?? "Sentry issue",
          fingerprint,
          environment: process.env.NODE_ENV ?? "production",
          ownerUserId: null,
          ownerName: this.toStringValue((issue.assignedTo as Record<string, unknown> | null)?.name),
          suggestedAction: "Review issue trace in Sentry and verify fix deployment.",
          metadata: {
            source: "sentry",
            sentryIssueId: id,
            permalink: this.toStringValue(issue.permalink),
            count: this.toStringValue(issue.count),
          },
        };
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchErrorLogStates(): Promise<Map<string, ErrorLogState>> {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: ERROR_LOG_STATE_PREFIX,
        },
      },
      select: {
        key: true,
        value: true,
      },
    });

    const map = new Map<string, ErrorLogState>();

    for (const row of rows) {
      const fingerprint = row.key.slice(ERROR_LOG_STATE_PREFIX.length);
      const state = this.parseStateValue(row.value);
      if (!state) {
        continue;
      }

      map.set(fingerprint, state);
    }

    return map;
  }

  private parseStateValue(raw: string | null | undefined): ErrorLogState | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const status = this.normalizeStatus(this.toStringValue(parsed.status));
      const ownerUserId = this.toNullableString(parsed.ownerUserId);
      const ownerName = this.toNullableString(parsed.ownerName);
      const note = this.toNullableString(parsed.note);
      const updatedAt = this.toStringValue(parsed.updatedAt);
      const updatedBy = this.toStringValue(parsed.updatedBy);

      if (!updatedAt || !updatedBy || !this.isIsoDate(updatedAt)) {
        return null;
      }

      return {
        status,
        ownerUserId,
        ownerName,
        note,
        updatedAt,
        updatedBy,
      };
    } catch {
      return null;
    }
  }

  private normalizeSeverity(value: string | null | undefined): AdminErrorLogSeverity {
    const normalized = value?.toLowerCase();
    if (normalized === "warn" || normalized === "warning") {
      return "warn";
    }

    if (normalized === "info") {
      return "info";
    }

    return "error";
  }

  private normalizeStatus(value: string | null | undefined): AdminErrorLogStatus {
    const normalized = value?.toLowerCase();
    if (normalized === "acknowledged") {
      return "acknowledged";
    }
    if (normalized === "resolved") {
      return "resolved";
    }

    return "open";
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private toStringValue(value: unknown): string | null {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    return null;
  }

  private toNullableString(value: unknown): string | null {
    const parsed = this.toStringValue(value);
    return parsed ?? null;
  }

  private formatActorName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
    email: string | null | undefined
  ): string | null {
    const fullName = [firstName, lastName]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim())
      .join(" ")
      .trim();

    if (fullName.length > 0) {
      return fullName;
    }

    return this.toNullableString(email);
  }

  private sanitizeFingerprint(value: string): string {
    return value.trim().slice(0, 240) || "unknown-fingerprint";
  }

  private sanitizeId(value: string): string {
    return value.trim().slice(0, 200) || "unknown-id";
  }

  private errorLogStateKey(fingerprint: string): string {
    return `${ERROR_LOG_STATE_PREFIX}${this.sanitizeFingerprint(fingerprint)}`;
  }

  private isIsoDate(value: string | null): boolean {
    if (!value) {
      return false;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp);
  }
}
