"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AdminQueueJobsModal } from "@/components/admin/admin-queue-jobs-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminQueueStats } from "@/hooks/useAdminSettings";

// Human-readable queue name labels
const QUEUE_LABELS: Record<string, string> = {
  "ai-formatting": "AI Formatting",
  "pdf-generation": "PDF Generation",
  "page-count": "Page Count",
  "production-delay": "Production Delay",
  "audit-log-archiver": "Audit Log Archiver",
};

function getQueueLabel(name: string): string {
  return QUEUE_LABELS[name] ?? name;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Clickable count cell
// ──────────────────────────────────────────────────────────────────────

interface CountCellProps {
  count: number;
  /** Used to pick the Badge colour */
  kind: "active" | "waiting" | "delayed" | "failed";
  queueName: string;
  isUnavailable: boolean;
  onSelect: (queue: string, state: string, count: number) => void;
}

const STATE_BY_KIND: Record<CountCellProps["kind"], string> = {
  active: "active",
  waiting: "waiting",
  delayed: "delayed",
  failed: "failed",
};

const BADGE_CLASSES: Record<CountCellProps["kind"], string> = {
  active: "border-[#1C5D2F] bg-[#0C1D12] text-[#8DE4A7]",
  waiting: "border-[#4B3714] bg-[#1A1205] text-[#F6D58F]",
  delayed: "border-[#525252] bg-[#1A1A1A] text-[#D2D2D2]",
  failed: "border-[#5D1C1C] bg-[#1D0C0C] text-[#E4A7A7]",
};

function CountCell({ count, kind, queueName, isUnavailable, onSelect }: CountCellProps) {
  if (isUnavailable) {
    return <span className="font-sans text-sm text-[#5A5A5A]">—</span>;
  }

  if (count <= 0) {
    return <span className="font-sans text-sm text-[#7A7A7A]">0</span>;
  }

  const state = STATE_BY_KIND[kind];

  return (
    <button
      type="button"
      title={`View ${count} ${kind} jobs in ${getQueueLabel(queueName)}`}
      onClick={() => onSelect(queueName, state, count)}
      className="inline-flex cursor-pointer items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
    >
      <Badge className={`${BADGE_CLASSES[kind]} transition-opacity hover:opacity-80`}>
        {count}
      </Badge>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Panel
// ──────────────────────────────────────────────────────────────────────

type SelectedView = { queue: string; state: string; count: number } | null;

export function AdminQueueHealthPanel() {
  const tAdmin = useTranslations("admin");
  const queueStatsQuery = useAdminQueueStats();
  const [selectedView, setSelectedView] = useState<SelectedView>(null);

  const stats = queueStatsQuery.stats;
  const isFetching = queueStatsQuery.isFetching;
  const isInitialLoading = queueStatsQuery.isInitialLoading;

  function handleSelectView(queue: string, state: string, count: number) {
    setSelectedView({ queue, state, count });
  }

  function handleCloseModal() {
    setSelectedView(null);
  }

  return (
    <>
      <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              {tAdmin("system_settings_section_queue_health")}
            </h2>
            {stats?.timestamp ? (
              <p className="font-sans mt-1 text-xs text-[#7D7D7D]">
                {tAdmin("system_settings_queue_health_as_of")} {formatTimestamp(stats.timestamp)}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {/* Redis down warning badge */}
            {stats && !stats.redisAvailable ? (
              <Badge className="border-[#5D1C1C] bg-[#1D0C0C] text-[#E4A7A7]">
                Redis unavailable
              </Badge>
            ) : null}

            {/* Refresh button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void queueStatsQuery.refetch()}
              className="rounded-full"
            >
              {isFetching ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              {tAdmin("system_settings_queue_health_refresh")}
            </Button>
          </div>
        </div>

        {/* Help text */}
        <p className="font-sans mt-2 text-sm text-[#AFAFAF]">
          {tAdmin("system_settings_queue_health_help")}
        </p>

        {/* Redis down banner */}
        {stats && !stats.redisAvailable ? (
          <div className="mt-4 rounded-xl border border-[#5D1C1C] bg-[#1D0C0C] px-4 py-3">
            <p className="font-sans text-sm text-[#E4A7A7]">
              {tAdmin("system_settings_queue_health_redis_down")}
            </p>
          </div>
        ) : null}

        {/* Body */}
        <div className="mt-4">
          {isInitialLoading ? (
            /* Initial load skeleton */
            <div className="flex items-center justify-center rounded-xl border border-[#232323] bg-[#0F0F0F] px-4 py-8">
              <Loader2 className="mr-2 size-4 animate-spin text-[#6A6A6A]" aria-hidden="true" />
              <span className="font-sans text-sm text-[#9D9D9D]">
                {tAdmin("system_settings_queue_health_loading")}
              </span>
            </div>
          ) : stats && stats.queues.length > 0 ? (
            /* Queue table */
            <div className="overflow-hidden rounded-xl border border-[#1F1F1F]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="border-b border-[#1F1F1F] bg-[#0A0A0A]">
                      <th className="font-sans px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                        {tAdmin("system_settings_queue_health_col_queue")}
                      </th>
                      <th className="font-sans px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                        {tAdmin("system_settings_queue_health_col_active")}
                      </th>
                      <th className="font-sans px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                        {tAdmin("system_settings_queue_health_col_waiting")}
                      </th>
                      <th className="font-sans px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                        {tAdmin("system_settings_queue_health_col_delayed")}
                      </th>
                      <th className="font-sans px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                        {tAdmin("system_settings_queue_health_col_failed")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.queues.map((queue, index) => {
                      const isUnavailable = queue.active === -1;
                      const rowBg = index % 2 === 0 ? "bg-[#0C0C0C]" : "bg-[#080808]";

                      return (
                        <tr
                          key={queue.name}
                          className={`border-b border-[#161616] last:border-b-0 ${rowBg}`}
                        >
                          {/* Queue name */}
                          <td className="px-4 py-3">
                            <span className="font-sans text-sm text-[#D0D0D0]">
                              {getQueueLabel(queue.name)}
                            </span>
                          </td>

                          {/* Active */}
                          <td className="px-4 py-3">
                            <CountCell
                              count={queue.active}
                              kind="active"
                              queueName={queue.name}
                              isUnavailable={isUnavailable}
                              onSelect={handleSelectView}
                            />
                          </td>

                          {/* Waiting */}
                          <td className="px-4 py-3">
                            <CountCell
                              count={queue.waiting}
                              kind="waiting"
                              queueName={queue.name}
                              isUnavailable={isUnavailable}
                              onSelect={handleSelectView}
                            />
                          </td>

                          {/* Delayed */}
                          <td className="px-4 py-3">
                            <CountCell
                              count={queue.delayed}
                              kind="delayed"
                              queueName={queue.name}
                              isUnavailable={isUnavailable}
                              onSelect={handleSelectView}
                            />
                          </td>

                          {/* Failed */}
                          <td className="px-4 py-3">
                            <CountCell
                              count={queue.failed}
                              kind="failed"
                              queueName={queue.name}
                              isUnavailable={isUnavailable}
                              onSelect={handleSelectView}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Click hint */}
              <p className="font-sans border-t border-[#161616] bg-[#080808] px-4 py-2 text-xs text-[#5A5A5A]">
                {tAdmin("system_settings_queue_health_click_hint")}
              </p>
            </div>
          ) : (
            /* No data / error state */
            <div className="rounded-xl border border-[#232323] bg-[#0F0F0F] px-4 py-8 text-center">
              <p className="font-sans text-sm text-[#9D9D9D]">
                {tAdmin("system_settings_loading")}
              </p>
            </div>
          )}
        </div>
      </article>

      {/* Job detail modal */}
      <AdminQueueJobsModal
        open={selectedView !== null}
        onClose={handleCloseModal}
        queueName={selectedView?.queue ?? ""}
        state={selectedView?.state ?? ""}
        count={selectedView?.count ?? 0}
      />
    </>
  );
}
