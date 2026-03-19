"use client";

import type { AdminAuditLogItem, AdminErrorLogItem } from "@bookprinta/shared";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Filter,
  Loader2,
  MoreHorizontal,
  NotebookText,
  ShieldAlert,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DashboardTableViewport } from "@/components/dashboard/dashboard-content-frame";
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  normalizeAdminLogsError,
  useAcknowledgeAdminErrorLogMutation,
  useAdminAuditLogs,
  useAdminErrorLogs,
  useAssignAdminErrorLogOwnerMutation,
  useAttachAdminErrorLogNoteMutation,
  useResolveAdminErrorLogMutation,
} from "@/hooks/useAdminLogs";
import { cn } from "@/lib/utils";

type LogsTab = "audit" | "errors";

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const DEFAULT_LIMIT = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const TABLE_SKELETON_ROWS = 6;
const TABLE_SKELETON_KEYS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;
const CARD_SKELETON_KEYS = ["card-1", "card-2", "card-3", "card-4"] as const;

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatAdminDateTime(value: string, locale: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function normalizeTab(value: string | null): LogsTab {
  return value === "errors" ? "errors" : "audit";
}

function severityBadgeClass(severity: AdminErrorLogItem["severity"]): string {
  if (severity === "error") return "border-[#ef4444]/45 bg-[#ef4444]/12 text-[#fca5a5]";
  if (severity === "warn") return "border-[#f59e0b]/45 bg-[#f59e0b]/12 text-[#fcd34d]";
  return "border-[#6b7280]/45 bg-[#6b7280]/12 text-[#d1d5db]";
}

function statusBadgeClass(status: AdminErrorLogItem["status"]): string {
  if (status === "resolved") return "border-[#22c55e]/45 bg-[#22c55e]/10 text-[#4ade80]";
  if (status === "acknowledged") return "border-[#3b82f6]/45 bg-[#3b82f6]/10 text-[#60a5fa]";
  return "border-[#f59e0b]/45 bg-[#f59e0b]/10 text-[#fbbf24]";
}

function prettyPrintPayload(value: unknown): string {
  if (value === null || value === undefined) {
    return "{}";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function FiltersToolbarSkeleton() {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

type AuditDesktopRow =
  | { kind: "record"; row: AdminAuditLogItem }
  | { kind: "expanded"; row: AdminAuditLogItem };

type ErrorDesktopRow =
  | { kind: "record"; row: AdminErrorLogItem }
  | { kind: "expanded"; row: AdminErrorLogItem };

function getAuditHeaderCellClass(columnId: string): string {
  if (columnId === "expand") return "w-[2.5rem]";
  if (columnId === "timestamp") return "min-w-[8.25rem]";
  if (columnId === "actor") return "min-w-[10rem]";
  if (columnId === "action") return "min-w-[8rem]";
  if (columnId === "entity") return "min-w-[12rem]";
  if (columnId === "ip") return "hidden xl:table-cell xl:min-w-[7.5rem]";
  if (columnId === "details") return "min-w-[12rem]";
  return "";
}

function getAuditBodyCellClass(columnId: string): string {
  if (columnId === "ip") return "hidden xl:table-cell";
  return "";
}

function getErrorHeaderCellClass(columnId: string): string {
  if (columnId === "expand") return "w-[2.5rem]";
  if (columnId === "timestamp") return "min-w-[8.25rem]";
  if (columnId === "severity") return "min-w-[7rem]";
  if (columnId === "service") return "min-w-[8rem]";
  if (columnId === "message") return "min-w-[14rem]";
  if (columnId === "state") return "min-w-[8rem]";
  if (columnId === "assigned") return "hidden xl:table-cell xl:min-w-[8rem]";
  if (columnId === "actions") return "min-w-[7rem] text-right";
  return "";
}

function getErrorBodyCellClass(columnId: string): string {
  if (columnId === "assigned") return "hidden xl:table-cell";
  if (columnId === "actions") return "text-right whitespace-nowrap";
  return "";
}

type FilterControlsProps = {
  tab: LogsTab;
  tAdmin: ReturnType<typeof useTranslations>;
  auditSearch: string;
  setAuditSearch: (value: string) => void;
  auditAction: string;
  setAuditAction: (value: string) => void;
  auditUser: string;
  setAuditUser: (value: string) => void;
  auditEntityType: string;
  setAuditEntityType: (value: string) => void;
  auditDateFrom: string;
  setAuditDateFrom: (value: string) => void;
  auditDateTo: string;
  setAuditDateTo: (value: string) => void;
  auditLimit: number;
  setAuditLimit: (value: number) => void;
  errorSearch: string;
  setErrorSearch: (value: string) => void;
  errorSeverity: "all" | "error" | "warn" | "info";
  setErrorSeverity: (value: "all" | "error" | "warn" | "info") => void;
  errorStatus: "all" | "open" | "acknowledged" | "resolved";
  setErrorStatus: (value: "all" | "open" | "acknowledged" | "resolved") => void;
  errorService: string;
  setErrorService: (value: string) => void;
  errorOwnerUserId: string;
  setErrorOwnerUserId: (value: string) => void;
  errorDateFrom: string;
  setErrorDateFrom: (value: string) => void;
  errorDateTo: string;
  setErrorDateTo: (value: string) => void;
  errorLimit: number;
  setErrorLimit: (value: number) => void;
};

function FilterControls(props: FilterControlsProps) {
  const {
    tab,
    tAdmin,
    auditSearch,
    setAuditSearch,
    auditAction,
    setAuditAction,
    auditUser,
    setAuditUser,
    auditEntityType,
    setAuditEntityType,
    auditDateFrom,
    setAuditDateFrom,
    auditDateTo,
    setAuditDateTo,
    auditLimit,
    setAuditLimit,
    errorSearch,
    setErrorSearch,
    errorSeverity,
    setErrorSeverity,
    errorStatus,
    setErrorStatus,
    errorService,
    setErrorService,
    errorOwnerUserId,
    setErrorOwnerUserId,
    errorDateFrom,
    setErrorDateFrom,
    errorDateTo,
    setErrorDateTo,
    errorLimit,
    setErrorLimit,
  } = props;

  if (tab === "audit") {
    return (
      <div className="grid gap-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
        <Input
          className="min-w-0"
          value={auditSearch}
          onChange={(event) => setAuditSearch(event.target.value)}
          placeholder={tAdmin("audit_logs_filter_search")}
          aria-label={tAdmin("audit_logs_filter_search")}
        />
        <Input
          className="min-w-0"
          value={auditAction}
          onChange={(event) => setAuditAction(event.target.value)}
          placeholder={tAdmin("audit_logs_filter_action")}
          aria-label={tAdmin("audit_logs_filter_action")}
        />
        <Input
          className="min-w-0"
          value={auditUser}
          onChange={(event) => setAuditUser(event.target.value)}
          placeholder={tAdmin("audit_logs_filter_user")}
          aria-label={tAdmin("audit_logs_filter_user")}
        />
        <Input
          className="min-w-0"
          value={auditEntityType}
          onChange={(event) => setAuditEntityType(event.target.value)}
          placeholder={tAdmin("audit_logs_filter_service")}
          aria-label={tAdmin("audit_logs_filter_service")}
        />
        <Input
          className="min-w-0"
          type="datetime-local"
          value={auditDateFrom}
          onChange={(event) => setAuditDateFrom(event.target.value)}
          aria-label={tAdmin("audit_logs_filter_date_from")}
        />
        <Input
          className="min-w-0"
          type="datetime-local"
          value={auditDateTo}
          onChange={(event) => setAuditDateTo(event.target.value)}
          aria-label={tAdmin("audit_logs_filter_date_to")}
        />
        <Select value={String(auditLimit)} onValueChange={(value) => setAuditLimit(Number(value))}>
          <SelectTrigger className="min-w-0">
            <SelectValue placeholder={tAdmin("audit_logs_filter_limit")} />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={`audit-filter-limit-${option}`} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
      <Input
        className="min-w-0"
        value={errorSearch}
        onChange={(event) => setErrorSearch(event.target.value)}
        placeholder={tAdmin("audit_logs_filter_search")}
        aria-label={tAdmin("audit_logs_filter_search")}
      />
      <Select
        value={errorSeverity}
        onValueChange={(value) => setErrorSeverity(value as typeof errorSeverity)}
      >
        <SelectTrigger className="min-w-0">
          <SelectValue placeholder={tAdmin("audit_logs_filter_severity")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tAdmin("audit_logs_filter_all_severities")}</SelectItem>
          <SelectItem value="error">error</SelectItem>
          <SelectItem value="warn">warn</SelectItem>
          <SelectItem value="info">info</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={errorStatus}
        onValueChange={(value) => setErrorStatus(value as typeof errorStatus)}
      >
        <SelectTrigger className="min-w-0">
          <SelectValue placeholder={tAdmin("audit_logs_filter_status")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tAdmin("audit_logs_filter_all_states")}</SelectItem>
          <SelectItem value="open">open</SelectItem>
          <SelectItem value="acknowledged">acknowledged</SelectItem>
          <SelectItem value="resolved">resolved</SelectItem>
        </SelectContent>
      </Select>
      <Input
        className="min-w-0"
        value={errorService}
        onChange={(event) => setErrorService(event.target.value)}
        placeholder={tAdmin("audit_logs_filter_service")}
      />
      <Input
        className="min-w-0"
        value={errorOwnerUserId}
        onChange={(event) => setErrorOwnerUserId(event.target.value)}
        placeholder={tAdmin("audit_logs_filter_assigned")}
        aria-label={tAdmin("audit_logs_filter_assigned")}
      />
      <Input
        className="min-w-0"
        type="datetime-local"
        value={errorDateFrom}
        onChange={(event) => setErrorDateFrom(event.target.value)}
        aria-label={tAdmin("audit_logs_filter_date_from")}
      />
      <Input
        className="min-w-0"
        type="datetime-local"
        value={errorDateTo}
        onChange={(event) => setErrorDateTo(event.target.value)}
        aria-label={tAdmin("audit_logs_filter_date_to")}
      />
      <Select value={String(errorLimit)} onValueChange={(value) => setErrorLimit(Number(value))}>
        <SelectTrigger className="min-w-0">
          <SelectValue placeholder={tAdmin("audit_logs_filter_limit")} />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((option) => (
            <SelectItem key={`error-filter-limit-${option}`} value={String(option)}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AdminAuditLogsLanding() {
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<LogsTab>(() => normalizeTab(searchParams.get("tab")));

  const [auditSearch, setAuditSearch] = useState(() => searchParams.get("aq") ?? "");
  const [auditAction, setAuditAction] = useState(() => searchParams.get("aAction") ?? "");
  const [auditUser, setAuditUser] = useState(() => searchParams.get("aUser") ?? "");
  const [auditEntityType, setAuditEntityType] = useState(() => searchParams.get("aType") ?? "");
  const [auditEntityId, setAuditEntityId] = useState(() => searchParams.get("aEntity") ?? "");
  const [auditDateFrom, setAuditDateFrom] = useState(() => searchParams.get("aFrom") ?? "");
  const [auditDateTo, setAuditDateTo] = useState(() => searchParams.get("aTo") ?? "");
  const [auditLimit, setAuditLimit] = useState(() => {
    const parsed = Number.parseInt(searchParams.get("aLimit") ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
  });

  const [errorSearch, setErrorSearch] = useState(() => searchParams.get("eq") ?? "");
  const [errorSeverity, setErrorSeverity] = useState<"all" | "error" | "warn" | "info">(() => {
    const value = searchParams.get("eSeverity");
    return value === "error" || value === "warn" || value === "info" ? value : "all";
  });
  const [errorStatus, setErrorStatus] = useState<"all" | "open" | "acknowledged" | "resolved">(
    () => {
      const value = searchParams.get("eStatus");
      return value === "open" || value === "acknowledged" || value === "resolved" ? value : "all";
    }
  );
  const [errorService, setErrorService] = useState(() => searchParams.get("eService") ?? "");
  const [errorOwnerUserId, setErrorOwnerUserId] = useState(() => searchParams.get("eOwner") ?? "");
  const [errorDateFrom, setErrorDateFrom] = useState(() => searchParams.get("eFrom") ?? "");
  const [errorDateTo, setErrorDateTo] = useState(() => searchParams.get("eTo") ?? "");
  const [errorLimit, setErrorLimit] = useState(() => {
    const parsed = Number.parseInt(searchParams.get("eLimit") ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
  });

  const [auditCursorTrail, setAuditCursorTrail] = useState<string[]>([""]);
  const [errorCursorTrail, setErrorCursorTrail] = useState<string[]>([""]);

  const [expandedAuditRows, setExpandedAuditRows] = useState<Record<string, boolean>>({});
  const [expandedErrorRows, setExpandedErrorRows] = useState<Record<string, boolean>>({});

  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  const [assignDialogTarget, setAssignDialogTarget] = useState<AdminErrorLogItem | null>(null);
  const [assignOwnerDraft, setAssignOwnerDraft] = useState("");
  const [noteDialogTarget, setNoteDialogTarget] = useState<AdminErrorLogItem | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const deferredAuditSearch = useDeferredValue(auditSearch.trim());
  const deferredErrorSearch = useDeferredValue(errorSearch.trim());

  const auditFilterSignature = [
    deferredAuditSearch,
    auditAction,
    auditUser,
    auditEntityType,
    auditEntityId,
    auditDateFrom,
    auditDateTo,
    auditLimit,
  ].join("|");

  const errorFilterSignature = [
    deferredErrorSearch,
    errorSeverity,
    errorStatus,
    errorService,
    errorOwnerUserId,
    errorDateFrom,
    errorDateTo,
    errorLimit,
  ].join("|");

  useEffect(() => {
    void auditFilterSignature;
    setAuditCursorTrail([""]);
  }, [auditFilterSignature]);

  useEffect(() => {
    void errorFilterSignature;
    setErrorCursorTrail([""]);
  }, [errorFilterSignature]);

  const currentAuditCursor = auditCursorTrail[auditCursorTrail.length - 1] ?? "";
  const currentErrorCursor = errorCursorTrail[errorCursorTrail.length - 1] ?? "";

  const auditLogsQuery = useAdminAuditLogs({
    cursor: currentAuditCursor || undefined,
    limit: auditLimit,
    action: auditAction.trim() || undefined,
    userId: auditUser.trim() || undefined,
    entityType: auditEntityType.trim() || undefined,
    entityId: auditEntityId.trim() || undefined,
    dateFrom: auditDateFrom || undefined,
    dateTo: auditDateTo || undefined,
    q: deferredAuditSearch || undefined,
  });

  const errorLogsQuery = useAdminErrorLogs({
    cursor: currentErrorCursor || undefined,
    limit: errorLimit,
    severity: errorSeverity === "all" ? undefined : errorSeverity,
    status: errorStatus === "all" ? undefined : errorStatus,
    service: errorService.trim() || undefined,
    ownerUserId: errorOwnerUserId.trim() || undefined,
    dateFrom: errorDateFrom || undefined,
    dateTo: errorDateTo || undefined,
    q: deferredErrorSearch || undefined,
  });

  const acknowledgeMutation = useAcknowledgeAdminErrorLogMutation();
  const assignOwnerMutation = useAssignAdminErrorLogOwnerMutation();
  const resolveMutation = useResolveAdminErrorLogMutation();
  const attachNoteMutation = useAttachAdminErrorLogNoteMutation();

  const isErrorActionPending =
    acknowledgeMutation.isPending ||
    assignOwnerMutation.isPending ||
    resolveMutation.isPending ||
    attachNoteMutation.isPending;

  useEffect(() => {
    const currentQueryString = searchParams.toString();
    const params = new URLSearchParams(currentQueryString);

    params.set("tab", activeTab);

    if (auditSearch.trim().length > 0) params.set("aq", auditSearch.trim());
    else params.delete("aq");

    if (auditAction.trim().length > 0) params.set("aAction", auditAction.trim());
    else params.delete("aAction");

    if (auditUser.trim().length > 0) params.set("aUser", auditUser.trim());
    else params.delete("aUser");

    if (auditEntityType.trim().length > 0) params.set("aType", auditEntityType.trim());
    else params.delete("aType");

    if (auditEntityId.trim().length > 0) params.set("aEntity", auditEntityId.trim());
    else params.delete("aEntity");

    if (auditDateFrom) params.set("aFrom", auditDateFrom);
    else params.delete("aFrom");

    if (auditDateTo) params.set("aTo", auditDateTo);
    else params.delete("aTo");

    if (auditLimit !== DEFAULT_LIMIT) params.set("aLimit", String(auditLimit));
    else params.delete("aLimit");

    if (errorSearch.trim().length > 0) params.set("eq", errorSearch.trim());
    else params.delete("eq");

    if (errorSeverity !== "all") params.set("eSeverity", errorSeverity);
    else params.delete("eSeverity");

    if (errorStatus !== "all") params.set("eStatus", errorStatus);
    else params.delete("eStatus");

    if (errorService.trim().length > 0) params.set("eService", errorService.trim());
    else params.delete("eService");

    if (errorOwnerUserId.trim().length > 0) params.set("eOwner", errorOwnerUserId.trim());
    else params.delete("eOwner");

    if (errorDateFrom) params.set("eFrom", errorDateFrom);
    else params.delete("eFrom");

    if (errorDateTo) params.set("eTo", errorDateTo);
    else params.delete("eTo");

    if (errorLimit !== DEFAULT_LIMIT) params.set("eLimit", String(errorLimit));
    else params.delete("eLimit");

    const nextQueryString = params.toString();
    if (nextQueryString === currentQueryString) {
      return;
    }

    router.replace(nextQueryString.length > 0 ? `${pathname}?${nextQueryString}` : pathname, {
      scroll: false,
    });
  }, [
    activeTab,
    auditAction,
    auditDateFrom,
    auditDateTo,
    auditEntityId,
    auditEntityType,
    auditLimit,
    auditSearch,
    auditUser,
    errorDateFrom,
    errorDateTo,
    errorLimit,
    errorOwnerUserId,
    errorSearch,
    errorService,
    errorSeverity,
    errorStatus,
    pathname,
    router,
    searchParams,
  ]);

  const auditRows = auditLogsQuery.items;
  const errorRows = errorLogsQuery.items;

  const auditActiveFilterCount = useMemo(() => {
    return [
      deferredAuditSearch,
      auditAction,
      auditUser,
      auditEntityType,
      auditEntityId,
      auditDateFrom,
      auditDateTo,
      auditLimit !== DEFAULT_LIMIT ? "limit" : "",
    ].filter((entry) => entry.length > 0).length;
  }, [
    deferredAuditSearch,
    auditAction,
    auditUser,
    auditEntityType,
    auditEntityId,
    auditDateFrom,
    auditDateTo,
    auditLimit,
  ]);

  const errorActiveFilterCount = useMemo(() => {
    return [
      deferredErrorSearch,
      errorSeverity !== "all" ? errorSeverity : "",
      errorStatus !== "all" ? errorStatus : "",
      errorService,
      errorOwnerUserId,
      errorDateFrom,
      errorDateTo,
      errorLimit !== DEFAULT_LIMIT ? "limit" : "",
    ].filter((entry) => entry.length > 0).length;
  }, [
    deferredErrorSearch,
    errorSeverity,
    errorStatus,
    errorService,
    errorOwnerUserId,
    errorDateFrom,
    errorDateTo,
    errorLimit,
  ]);

  function clearCurrentTabFilters() {
    if (activeTab === "audit") {
      setAuditSearch("");
      setAuditAction("");
      setAuditUser("");
      setAuditEntityType("");
      setAuditEntityId("");
      setAuditDateFrom("");
      setAuditDateTo("");
      setAuditLimit(DEFAULT_LIMIT);
      return;
    }

    setErrorSearch("");
    setErrorSeverity("all");
    setErrorStatus("all");
    setErrorService("");
    setErrorOwnerUserId("");
    setErrorDateFrom("");
    setErrorDateTo("");
    setErrorLimit(DEFAULT_LIMIT);
  }

  const handleAcknowledge = useCallback(
    async (row: AdminErrorLogItem) => {
      try {
        await acknowledgeMutation.mutateAsync(row.id);
        toast.success(tAdmin("system_settings_saved"));
      } catch (error) {
        const normalized = normalizeAdminLogsError(error);
        toast.error(normalized.description || tAdmin("audit_logs_load_failed"));
      }
    },
    [acknowledgeMutation, tAdmin]
  );

  const handleResolve = useCallback(
    async (row: AdminErrorLogItem) => {
      try {
        await resolveMutation.mutateAsync(row.id);
        toast.success(tAdmin("system_settings_saved"));
      } catch (error) {
        const normalized = normalizeAdminLogsError(error);
        toast.error(normalized.description || tAdmin("audit_logs_load_failed"));
      }
    },
    [resolveMutation, tAdmin]
  );

  async function confirmAssignOwner() {
    if (!assignDialogTarget) return;

    try {
      await assignOwnerMutation.mutateAsync({
        id: assignDialogTarget.id,
        ownerUserId: assignOwnerDraft.trim(),
      });
      setAssignDialogTarget(null);
      setAssignOwnerDraft("");
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminLogsError(error);
      toast.error(normalized.description || tAdmin("audit_logs_load_failed"));
    }
  }

  async function confirmAttachNote() {
    if (!noteDialogTarget) return;

    try {
      await attachNoteMutation.mutateAsync({
        id: noteDialogTarget.id,
        note: noteDraft.trim(),
      });
      setNoteDialogTarget(null);
      setNoteDraft("");
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminLogsError(error);
      toast.error(normalized.description || tAdmin("audit_logs_load_failed"));
    }
  }

  const toggleAuditExpand = useCallback((id: string) => {
    setExpandedAuditRows((previous) => ({ ...previous, [id]: !previous[id] }));
  }, []);

  const toggleErrorExpand = useCallback((id: string) => {
    setExpandedErrorRows((previous) => ({ ...previous, [id]: !previous[id] }));
  }, []);

  const auditDesktopRows = useMemo<AuditDesktopRow[]>(() => {
    return auditRows.flatMap((row) => {
      const isExpanded = Boolean(expandedAuditRows[row.id]);
      return isExpanded
        ? ([
            { kind: "record", row },
            { kind: "expanded", row },
          ] satisfies AuditDesktopRow[])
        : ([{ kind: "record", row }] satisfies AuditDesktopRow[]);
    });
  }, [auditRows, expandedAuditRows]);

  const errorDesktopRows = useMemo<ErrorDesktopRow[]>(() => {
    return errorRows.flatMap((row) => {
      const isExpanded = Boolean(expandedErrorRows[row.id]);
      return isExpanded
        ? ([
            { kind: "record", row },
            { kind: "expanded", row },
          ] satisfies ErrorDesktopRow[])
        : ([{ kind: "record", row }] satisfies ErrorDesktopRow[]);
    });
  }, [errorRows, expandedErrorRows]);

  const auditColumns = useMemo<ColumnDef<AuditDesktopRow>[]>(
    () => [
      {
        id: "expand",
        header: () => null,
        cell: ({ row }) => {
          if (row.original.kind === "expanded") {
            return null;
          }

          const originalRow = row.original.row;
          const isExpanded = Boolean(expandedAuditRows[originalRow.id]);

          return (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-[#D7D7D7] hover:bg-[#171717] hover:text-white"
              onClick={() => toggleAuditExpand(originalRow.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? tAdmin("audit_logs_collapse") : tAdmin("audit_logs_expand")}
            >
              {isExpanded ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4" aria-hidden="true" />
              )}
            </Button>
          );
        },
      },
      {
        id: "timestamp",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_timestamp")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">
              {formatAdminDateTime(row.original.row.timestamp, locale)}
            </span>
          ),
      },
      {
        id: "actor",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_actor")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">{row.original.row.actorName ?? "-"}</span>
          ),
      },
      {
        id: "action",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_action")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">{row.original.row.action}</span>
          ),
      },
      {
        id: "entity",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_entity")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">
              {row.original.row.entityType} / {row.original.row.entityId}
            </span>
          ),
      },
      {
        id: "ip",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_ip")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">{row.original.row.ipAddress ?? "-"}</span>
          ),
      },
      {
        id: "details",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_details")}
          </span>
        ),
        cell: ({ row }) => {
          if (row.original.kind === "expanded") {
            const expandedRow = row.original.row;
            return (
              <pre className="max-h-60 overflow-auto rounded-md border border-[#232323] bg-[#050505] p-3 text-[11px] leading-5 text-[#B4B4B4]">
                {prettyPrintPayload({
                  ipAddress: expandedRow.ipAddress,
                  userAgent: expandedRow.userAgent,
                  details: expandedRow.details,
                })}
              </pre>
            );
          }

          return (
            <span className="block max-w-[18rem] truncate text-xs text-[#D5D5D5]">
              {row.original.row.userAgent ?? tAdmin("audit_logs_metadata_label")}
            </span>
          );
        },
      },
    ],
    [expandedAuditRows, locale, tAdmin, toggleAuditExpand]
  );

  const errorColumns = useMemo<ColumnDef<ErrorDesktopRow>[]>(
    () => [
      {
        id: "expand",
        header: () => null,
        cell: ({ row }) => {
          if (row.original.kind === "expanded") {
            return null;
          }

          const originalRow = row.original.row;
          const isExpanded = Boolean(expandedErrorRows[originalRow.id]);

          return (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-[#D7D7D7] hover:bg-[#171717] hover:text-white"
              onClick={() => toggleErrorExpand(originalRow.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? tAdmin("audit_logs_collapse") : tAdmin("audit_logs_expand")}
            >
              {isExpanded ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4" aria-hidden="true" />
              )}
            </Button>
          );
        },
      },
      {
        id: "timestamp",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_timestamp")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">
              {formatAdminDateTime(row.original.row.timestamp, locale)}
            </span>
          ),
      },
      {
        id: "severity",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_severity")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <Badge variant="outline" className={severityBadgeClass(row.original.row.severity)}>
              {row.original.row.severity}
            </Badge>
          ),
      },
      {
        id: "service",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_filter_service")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">{row.original.row.service}</span>
          ),
      },
      {
        id: "message",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_message")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="block max-w-[24rem] truncate text-xs text-[#D5D5D5]">
              {row.original.row.message}
            </span>
          ),
      },
      {
        id: "state",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_column_state")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <Badge variant="outline" className={statusBadgeClass(row.original.row.status)}>
              {row.original.row.status}
            </Badge>
          ),
      },
      {
        id: "assigned",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_filter_assigned")}
          </span>
        ),
        cell: ({ row }) =>
          row.original.kind === "expanded" ? null : (
            <span className="text-xs text-[#D5D5D5]">{row.original.row.ownerName ?? "-"}</span>
          ),
      },
      {
        id: "actions",
        header: () => (
          <span className="block text-right font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("audit_logs_action_menu")}
          </span>
        ),
        cell: ({ row }) => {
          if (row.original.kind === "expanded") {
            const expandedRow = row.original.row;
            return (
              <pre className="max-h-64 overflow-auto rounded-md border border-[#232323] bg-[#050505] p-3 text-[11px] leading-5 text-[#B4B4B4]">
                {prettyPrintPayload({
                  fingerprint: expandedRow.fingerprint,
                  environment: expandedRow.environment,
                  suggestedAction: expandedRow.suggestedAction,
                  metadata: expandedRow.metadata,
                })}
              </pre>
            );
          }

          const originalRow = row.original.row;
          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
                    disabled={isErrorActionPending}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={isErrorActionPending || originalRow.status !== "open"}
                    onClick={() => void handleAcknowledge(originalRow)}
                  >
                    {tAdmin("audit_logs_action_acknowledge")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isErrorActionPending || originalRow.status === "resolved"}
                    onClick={() => {
                      setAssignDialogTarget(originalRow);
                      setAssignOwnerDraft(originalRow.ownerUserId ?? "");
                    }}
                  >
                    {tAdmin("audit_logs_action_assign")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isErrorActionPending || originalRow.status === "resolved"}
                    onClick={() => {
                      setNoteDialogTarget(originalRow);
                      setNoteDraft("");
                    }}
                  >
                    {tAdmin("audit_logs_action_add_note")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isErrorActionPending || originalRow.status === "resolved"}
                    onClick={() => void handleResolve(originalRow)}
                  >
                    {tAdmin("audit_logs_action_resolve")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [
      expandedErrorRows,
      isErrorActionPending,
      locale,
      tAdmin,
      toggleErrorExpand,
      handleAcknowledge,
      handleResolve,
    ]
  );

  const auditTable = useReactTable({
    data: auditDesktopRows,
    columns: auditColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const errorTable = useReactTable({
    data: errorDesktopRows,
    columns: errorColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const activeFilterCount = activeTab === "audit" ? auditActiveFilterCount : errorActiveFilterCount;
  const auditCurrentPage = auditCursorTrail.length;
  const errorCurrentPage = errorCursorTrail.length;
  const auditTotalPages =
    auditLogsQuery.totalItems > 0
      ? Math.ceil(auditLogsQuery.totalItems / Math.max(auditLogsQuery.limit, 1))
      : 0;
  const errorTotalPages =
    errorLogsQuery.totalItems > 0
      ? Math.ceil(errorLogsQuery.totalItems / Math.max(errorLogsQuery.limit, 1))
      : 0;

  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {tAdmin("audit_logs_scope_title")}
        </h1>
        <p className="font-sans mt-3 max-w-3xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("audit_logs_scope_description")}
        </p>
      </div>

      <div className="min-w-0 rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-[#8A8A8A]">
            {tAdmin("audit_logs_filter_title")}
          </p>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white md:hidden"
            onClick={() => setIsMobileFilterOpen(true)}
          >
            <Filter className="mr-2 size-4" />
            {tAdmin("audit_logs_filter_button")}
          </Button>
        </div>

        <div className="mt-4 hidden md:block">
          {activeTab === "audit" && auditLogsQuery.isInitialLoading ? (
            <FiltersToolbarSkeleton />
          ) : activeTab === "errors" && errorLogsQuery.isInitialLoading ? (
            <FiltersToolbarSkeleton />
          ) : (
            <FilterControls
              tab={activeTab}
              tAdmin={tAdmin}
              auditSearch={auditSearch}
              setAuditSearch={setAuditSearch}
              auditAction={auditAction}
              setAuditAction={setAuditAction}
              auditUser={auditUser}
              setAuditUser={setAuditUser}
              auditEntityType={auditEntityType}
              setAuditEntityType={setAuditEntityType}
              auditDateFrom={auditDateFrom}
              setAuditDateFrom={setAuditDateFrom}
              auditDateTo={auditDateTo}
              setAuditDateTo={setAuditDateTo}
              auditLimit={auditLimit}
              setAuditLimit={setAuditLimit}
              errorSearch={errorSearch}
              setErrorSearch={setErrorSearch}
              errorSeverity={errorSeverity}
              setErrorSeverity={setErrorSeverity}
              errorStatus={errorStatus}
              setErrorStatus={setErrorStatus}
              errorService={errorService}
              setErrorService={setErrorService}
              errorOwnerUserId={errorOwnerUserId}
              setErrorOwnerUserId={setErrorOwnerUserId}
              errorDateFrom={errorDateFrom}
              setErrorDateFrom={setErrorDateFrom}
              errorDateTo={errorDateTo}
              setErrorDateTo={setErrorDateTo}
              errorLimit={errorLimit}
              setErrorLimit={setErrorLimit}
            />
          )}
        </div>

        <div role="tablist" aria-label="Log viewer" className="mt-4 flex flex-wrap gap-2">
          <Button
            id="tab-audit"
            role="tab"
            aria-selected={activeTab === "audit"}
            aria-controls="tabpanel-audit"
            type="button"
            size="sm"
            variant={activeTab === "audit" ? "default" : "outline"}
            className={
              activeTab === "audit"
                ? "rounded-full bg-[#007eff] text-white hover:bg-[#0066d1]"
                : "rounded-full border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
            }
            onClick={() => setActiveTab("audit")}
          >
            {tAdmin("audit_logs_tab_audit")}
          </Button>
          <Button
            id="tab-errors"
            role="tab"
            aria-selected={activeTab === "errors"}
            aria-controls="tabpanel-errors"
            type="button"
            size="sm"
            variant={activeTab === "errors" ? "default" : "outline"}
            className={
              activeTab === "errors"
                ? "rounded-full bg-[#007eff] text-white hover:bg-[#0066d1]"
                : "rounded-full border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
            }
            onClick={() => setActiveTab("errors")}
          >
            {tAdmin("audit_logs_tab_errors")}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-sans text-xs text-[#9A9A9A]">
            {activeFilterCount > 0
              ? tAdmin("reviews_filters_active", { count: activeFilterCount })
              : tAdmin("reviews_filters_idle")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[#D7D7D7] hover:bg-[#171717] hover:text-white"
            onClick={clearCurrentTabFilters}
          >
            {tAdmin("audit_logs_filter_clear")}
          </Button>
        </div>
      </div>

      {activeTab === "audit" ? (
        <div
          id="tabpanel-audit"
          role="tabpanel"
          aria-labelledby="tab-audit"
          className="min-w-0 rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4 md:p-6"
        >
          <div className="hidden md:block">
            <DashboardTableViewport
              className="touch-pan-x"
              minWidthClassName="md:min-w-[940px] xl:min-w-[1080px] 2xl:min-w-[1160px]"
            >
              <Table className="min-w-[940px] border-collapse xl:min-w-[1080px] 2xl:min-w-[1160px]">
                <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
                  {auditTable.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="border-b border-[#2A2A2A] hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={cn(
                            "h-12 px-4 align-middle",
                            getAuditHeaderCellClass(header.id)
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
                  {auditLogsQuery.isInitialLoading ? (
                    TABLE_SKELETON_KEYS.slice(0, TABLE_SKELETON_ROWS).map((key) => (
                      <TableRow
                        key={`audit-skeleton-${key}`}
                        className="border-b border-[#2A2A2A] bg-[#111111]"
                      >
                        <TableCell className="px-4 py-4">
                          <Skeleton className="size-6 rounded-full" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-40" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-44" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : auditDesktopRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                          <NotebookText className="size-8 text-[#7D7D7D]" />
                          <p className="font-sans text-sm font-medium text-[#D5D5D5]">
                            {tAdmin("audit_logs_empty_audit_title")}
                          </p>
                          <p className="font-sans max-w-md text-xs text-[#9A9A9A]">
                            {tAdmin("audit_logs_empty_audit_description")}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditTable.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="border-b border-[#2A2A2A] bg-[#111111] transition-colors duration-150 hover:bg-[#1A1A1A] last:border-b-0"
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isExpandedRow = row.original.kind === "expanded";
                          if (isExpandedRow && cell.column.id !== "details") {
                            return null;
                          }

                          if (isExpandedRow && cell.column.id === "details") {
                            return (
                              <TableCell
                                key={cell.id}
                                colSpan={7}
                                className="px-4 py-4 align-middle"
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                "px-4 py-4 align-middle",
                                getAuditBodyCellClass(cell.column.id)
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DashboardTableViewport>
          </div>

          <div className="grid gap-3 md:hidden">
            {auditLogsQuery.isInitialLoading ? (
              CARD_SKELETON_KEYS.map((key) => (
                <div
                  key={`audit-mobile-skeleton-${key}`}
                  className="rounded-xl border border-[#1F1F1F] bg-[#080808] p-4"
                >
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-3 h-4 w-28" />
                  <Skeleton className="mt-2 h-4 w-44" />
                  <Skeleton className="mt-4 h-9 w-full" />
                </div>
              ))
            ) : auditRows.length === 0 ? (
              <div className="rounded-xl border border-[#1F1F1F] bg-[#080808] p-5 text-center">
                <NotebookText className="mx-auto size-8 text-[#7D7D7D]" />
                <p className="font-sans mt-3 text-sm font-medium text-[#D5D5D5]">
                  {tAdmin("audit_logs_empty_audit_title")}
                </p>
                <p className="font-sans mt-1 text-xs text-[#9A9A9A]">
                  {tAdmin("audit_logs_empty_audit_description")}
                </p>
              </div>
            ) : (
              auditRows.map((row: AdminAuditLogItem) => {
                const isExpanded = Boolean(expandedAuditRows[row.id]);

                return (
                  <article
                    key={row.id}
                    className="rounded-xl border border-[#1F1F1F] bg-[#080808] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-sans text-xs text-[#B4B4B4]">
                        {formatAdminDateTime(row.timestamp, locale)}
                      </p>
                      <Badge
                        variant="outline"
                        className="border-[#6b7280]/45 bg-[#6b7280]/12 text-[#d1d5db]"
                      >
                        {row.action}
                      </Badge>
                    </div>
                    <p className="font-sans mt-2 text-sm text-[#E5E5E5]">{row.actorName ?? "-"}</p>
                    <p className="font-sans mt-1 text-xs text-[#A3A3A3]">
                      {row.entityType} / {row.entityId}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => toggleAuditExpand(row.id)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded ? tAdmin("audit_logs_collapse") : tAdmin("audit_logs_expand")
                      }
                    >
                      {isExpanded ? tAdmin("audit_logs_collapse") : tAdmin("audit_logs_expand")}
                    </Button>
                    {isExpanded ? (
                      <pre className="mt-3 max-h-60 overflow-auto rounded-md border border-[#232323] bg-[#050505] p-3 text-[11px] leading-5 text-[#B4B4B4]">
                        {prettyPrintPayload({
                          ipAddress: row.ipAddress,
                          userAgent: row.userAgent,
                          details: row.details,
                        })}
                      </pre>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          <nav
            aria-label={tAdmin("audit_logs_pagination_aria")}
            className="mt-4 flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="space-y-1">
              <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
                {auditTotalPages > 0
                  ? tAdmin("audit_logs_pagination_page_of", {
                      page: auditCurrentPage,
                      totalPages: auditTotalPages,
                    })
                  : tAdmin("audit_logs_pagination_page", { page: auditCurrentPage })}
              </p>
              <p className="font-sans text-[11px] text-[#9A9A9A]">
                {tAdmin("audit_logs_summary_total", {
                  shown: auditRows.length,
                  total: auditLogsQuery.totalItems,
                })}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <span className="font-sans text-[11px] text-[#A3A3A3]">
                  {tAdmin("audit_logs_rows_per_page")}
                </span>
                <Select
                  value={String(auditLimit)}
                  onValueChange={(value) => setAuditLimit(Number(value))}
                >
                  <SelectTrigger className="h-9 w-[92px] min-w-0 border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={`audit-pagination-limit-${option}`} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
                disabled={auditCursorTrail.length <= 1 || auditLogsQuery.isFetching}
                onClick={() => setAuditCursorTrail((previous) => previous.slice(0, -1))}
              >
                {tAdmin("audit_logs_page_prev")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
                disabled={
                  !auditLogsQuery.hasMore || !auditLogsQuery.nextCursor || auditLogsQuery.isFetching
                }
                onClick={() =>
                  setAuditCursorTrail((previous) => [...previous, auditLogsQuery.nextCursor ?? ""])
                }
              >
                {tAdmin("audit_logs_page_next")}
              </Button>
            </div>
          </nav>
        </div>
      ) : (
        <div
          id="tabpanel-errors"
          role="tabpanel"
          aria-labelledby="tab-errors"
          className="min-w-0 rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4 md:p-6"
        >
          <div className="hidden md:block">
            <DashboardTableViewport
              className="touch-pan-x"
              minWidthClassName="md:min-w-[1020px] xl:min-w-[1180px] 2xl:min-w-[1240px]"
            >
              <Table className="min-w-[1020px] border-collapse xl:min-w-[1180px] 2xl:min-w-[1240px]">
                <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
                  {errorTable.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="border-b border-[#2A2A2A] hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={cn(
                            "h-12 px-4 align-middle",
                            getErrorHeaderCellClass(header.id)
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
                  {errorLogsQuery.isInitialLoading ? (
                    TABLE_SKELETON_KEYS.slice(0, TABLE_SKELETON_ROWS).map((key) => (
                      <TableRow
                        key={`error-skeleton-${key}`}
                        className="border-b border-[#2A2A2A] bg-[#111111]"
                      >
                        <TableCell className="px-4 py-4">
                          <Skeleton className="size-6 rounded-full" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-40" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-52" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Skeleton className="ml-auto h-8 w-8 rounded-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : errorDesktopRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                          <ShieldAlert className="size-8 text-[#7D7D7D]" />
                          <p className="font-sans text-sm font-medium text-[#D5D5D5]">
                            {tAdmin("audit_logs_empty_errors_title")}
                          </p>
                          <p className="font-sans max-w-md text-xs text-[#9A9A9A]">
                            {tAdmin("audit_logs_empty_errors_description")}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    errorTable.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="border-b border-[#2A2A2A] bg-[#111111] transition-colors duration-150 hover:bg-[#1A1A1A] last:border-b-0"
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isExpandedRow = row.original.kind === "expanded";
                          if (isExpandedRow && cell.column.id !== "actions") {
                            return null;
                          }

                          if (isExpandedRow && cell.column.id === "actions") {
                            return (
                              <TableCell
                                key={cell.id}
                                colSpan={8}
                                className="px-4 py-4 align-middle"
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                "px-4 py-4 align-middle",
                                getErrorBodyCellClass(cell.column.id)
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DashboardTableViewport>
          </div>

          <div className="grid gap-3 md:hidden">
            {errorLogsQuery.isInitialLoading ? (
              CARD_SKELETON_KEYS.map((key) => (
                <div
                  key={`error-mobile-skeleton-${key}`}
                  className="rounded-xl border border-[#1F1F1F] bg-[#080808] p-4"
                >
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-3 h-6 w-20 rounded-full" />
                  <Skeleton className="mt-2 h-4 w-48" />
                  <Skeleton className="mt-4 h-9 w-full" />
                </div>
              ))
            ) : errorRows.length === 0 ? (
              <div className="rounded-xl border border-[#1F1F1F] bg-[#080808] p-5 text-center">
                <ShieldAlert className="mx-auto size-8 text-[#7D7D7D]" />
                <p className="font-sans mt-3 text-sm font-medium text-[#D5D5D5]">
                  {tAdmin("audit_logs_empty_errors_title")}
                </p>
                <p className="font-sans mt-1 text-xs text-[#9A9A9A]">
                  {tAdmin("audit_logs_empty_errors_description")}
                </p>
              </div>
            ) : (
              errorRows.map((row: AdminErrorLogItem) => {
                const isExpanded = Boolean(expandedErrorRows[row.id]);

                return (
                  <article
                    key={row.id}
                    className="rounded-xl border border-[#1F1F1F] bg-[#080808] p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-sans text-xs text-[#B4B4B4]">
                        {formatAdminDateTime(row.timestamp, locale)}
                      </p>
                      <Badge variant="outline" className={severityBadgeClass(row.severity)}>
                        {row.severity}
                      </Badge>
                    </div>
                    <p className="font-sans mt-2 text-sm text-[#E5E5E5]">{row.message}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge variant="outline" className={statusBadgeClass(row.status)}>
                        {row.status}
                      </Badge>
                      <p className="font-sans text-xs text-[#A3A3A3]">{row.ownerName ?? "-"}</p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
                        disabled={isErrorActionPending}
                        onClick={() => {
                          setAssignDialogTarget(row);
                          setAssignOwnerDraft(row.ownerUserId ?? "");
                        }}
                      >
                        {tAdmin("audit_logs_action_assign")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1 border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
                          >
                            {tAdmin("audit_logs_action_menu")}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={isErrorActionPending || row.status !== "open"}
                            onClick={() => void handleAcknowledge(row)}
                          >
                            {tAdmin("audit_logs_action_acknowledge")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isErrorActionPending || row.status === "resolved"}
                            onClick={() => {
                              setNoteDialogTarget(row);
                              setNoteDraft("");
                            }}
                          >
                            {tAdmin("audit_logs_action_add_note")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isErrorActionPending || row.status === "resolved"}
                            onClick={() => void handleResolve(row)}
                          >
                            {tAdmin("audit_logs_action_resolve")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full text-[#D7D7D7] hover:bg-[#171717] hover:text-white"
                      onClick={() => toggleErrorExpand(row.id)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded ? tAdmin("audit_logs_collapse") : tAdmin("audit_logs_expand")
                      }
                    >
                      {isExpanded ? tAdmin("audit_logs_collapse") : tAdmin("audit_logs_expand")}
                    </Button>
                    {isExpanded ? (
                      <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-[#232323] bg-[#050505] p-3 text-[11px] leading-5 text-[#B4B4B4]">
                        {prettyPrintPayload({
                          fingerprint: row.fingerprint,
                          environment: row.environment,
                          suggestedAction: row.suggestedAction,
                          metadata: row.metadata,
                        })}
                      </pre>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          <nav
            aria-label={tAdmin("audit_logs_pagination_aria")}
            className="mt-4 flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="space-y-1">
              <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
                {errorTotalPages > 0
                  ? tAdmin("audit_logs_pagination_page_of", {
                      page: errorCurrentPage,
                      totalPages: errorTotalPages,
                    })
                  : tAdmin("audit_logs_pagination_page", { page: errorCurrentPage })}
              </p>
              <p className="font-sans text-[11px] text-[#9A9A9A]">
                {tAdmin("audit_logs_summary_total", {
                  shown: errorRows.length,
                  total: errorLogsQuery.totalItems,
                })}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <span className="font-sans text-[11px] text-[#A3A3A3]">
                  {tAdmin("audit_logs_rows_per_page")}
                </span>
                <Select
                  value={String(errorLimit)}
                  onValueChange={(value) => setErrorLimit(Number(value))}
                >
                  <SelectTrigger className="h-9 w-[92px] min-w-0 border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={`error-pagination-limit-${option}`} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
                disabled={errorCursorTrail.length <= 1 || errorLogsQuery.isFetching}
                onClick={() => setErrorCursorTrail((previous) => previous.slice(0, -1))}
              >
                {tAdmin("audit_logs_page_prev")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
                disabled={
                  !errorLogsQuery.hasMore || !errorLogsQuery.nextCursor || errorLogsQuery.isFetching
                }
                onClick={() =>
                  setErrorCursorTrail((previous) => [...previous, errorLogsQuery.nextCursor ?? ""])
                }
              >
                {tAdmin("audit_logs_page_next")}
              </Button>
            </div>
          </nav>
        </div>
      )}

      <Drawer open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{tAdmin("audit_logs_filter_title")}</DrawerTitle>
            <DrawerDescription>{tAdmin("audit_logs_filter_description")}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <FilterControls
              tab={activeTab}
              tAdmin={tAdmin}
              auditSearch={auditSearch}
              setAuditSearch={setAuditSearch}
              auditAction={auditAction}
              setAuditAction={setAuditAction}
              auditUser={auditUser}
              setAuditUser={setAuditUser}
              auditEntityType={auditEntityType}
              setAuditEntityType={setAuditEntityType}
              auditDateFrom={auditDateFrom}
              setAuditDateFrom={setAuditDateFrom}
              auditDateTo={auditDateTo}
              setAuditDateTo={setAuditDateTo}
              auditLimit={auditLimit}
              setAuditLimit={setAuditLimit}
              errorSearch={errorSearch}
              setErrorSearch={setErrorSearch}
              errorSeverity={errorSeverity}
              setErrorSeverity={setErrorSeverity}
              errorStatus={errorStatus}
              setErrorStatus={setErrorStatus}
              errorService={errorService}
              setErrorService={setErrorService}
              errorOwnerUserId={errorOwnerUserId}
              setErrorOwnerUserId={setErrorOwnerUserId}
              errorDateFrom={errorDateFrom}
              setErrorDateFrom={setErrorDateFrom}
              errorDateTo={errorDateTo}
              setErrorDateTo={setErrorDateTo}
              errorLimit={errorLimit}
              setErrorLimit={setErrorLimit}
            />
          </div>
          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#2A2A2A] bg-[#0D0D0D] text-[#E8E8E8] hover:bg-[#171717] hover:text-white"
              onClick={clearCurrentTabFilters}
            >
              {tAdmin("audit_logs_filter_clear")}
            </Button>
            <Button
              type="button"
              className="bg-[#007eff] text-white hover:bg-[#0066d1]"
              onClick={() => setIsMobileFilterOpen(false)}
            >
              {tAdmin("audit_logs_filter_apply")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={Boolean(assignDialogTarget)}
        onOpenChange={(open) => !open && setAssignDialogTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAdmin("audit_logs_assign_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tAdmin("audit_logs_assign_description", {
                fingerprint: assignDialogTarget?.fingerprint ?? "-",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={assignOwnerDraft}
            onChange={(event) => setAssignOwnerDraft(event.target.value)}
            placeholder={tAdmin("audit_logs_owner_placeholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#007eff] text-white hover:bg-[#0066d1]"
              disabled={assignOwnerDraft.trim().length === 0}
              onClick={() => void confirmAssignOwner()}
            >
              {assignOwnerMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                tAdmin("audit_logs_action_assign")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(noteDialogTarget)}
        onOpenChange={(open) => !open && setNoteDialogTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAdmin("audit_logs_note_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tAdmin("audit_logs_note_description", {
                fingerprint: noteDialogTarget?.fingerprint ?? "-",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={4}
            placeholder={tAdmin("audit_logs_note_placeholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#007eff] text-white hover:bg-[#0066d1]"
              disabled={noteDraft.trim().length === 0}
              onClick={() => void confirmAttachNote()}
            >
              {attachNoteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                tAdmin("audit_logs_action_add_note")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(auditLogsQuery.isError || errorLogsQuery.isError) && (
        <div className="rounded-[1rem] border border-[#7F1D1D] bg-[#3C0D0D]/40 p-4 text-[#FECACA]">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4" />
            <p className="font-sans text-sm">
              {normalizeAdminLogsError(auditLogsQuery.error ?? errorLogsQuery.error).description}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
