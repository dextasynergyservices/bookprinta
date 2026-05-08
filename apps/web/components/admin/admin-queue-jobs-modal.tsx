"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminQueueJobs } from "@/hooks/useAdminSettings";

// ──────────────────────────────────────────────────────────────────────
// Types & helpers
// ──────────────────────────────────────────────────────────────────────

const QUEUE_LABELS: Record<string, string> = {
  "ai-formatting": "AI Formatting",
  "pdf-generation": "PDF Generation",
  "page-count": "Page Count",
  "production-delay": "Production Delay",
  "audit-log-archiver": "Audit Log Archiver",
};

// Static map avoids dynamic translation-key construction (which errors on empty state)
const STATE_LABELS: Record<string, string> = {
  waiting: "Waiting",
  active: "Active",
  failed: "Failed",
  completed: "Completed",
  delayed: "Delayed",
  paused: "Paused",
};

function formatMs(ms: number | null | undefined): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return String(ms);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Job row (expandable)
// ──────────────────────────────────────────────────────────────────────

type JobDetailItemShape = {
  id: string;
  name: string;
  attemptsMade: number;
  failedReason: string | null;
  stacktrace: string[];
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  delay: number;
  progress: string;
  data: string;
};

interface JobRowProps {
  job: JobDetailItemShape;
  state: string;
  index: number;
  tAdmin: ReturnType<typeof useTranslations<"admin">>;
}

function JobRow({ job, state, index, tAdmin }: JobRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isFailed = state === "failed";
  const rowBg = index % 2 === 0 ? "bg-[#0C0C0C]" : "bg-[#080808]";

  return (
    <>
      {/* Summary row — always visible */}
      <tr
        className={`border-b border-[#161616] last:border-b-0 ${rowBg} cursor-pointer select-none`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Expand icon */}
        <td className="px-3 py-3 text-[#6A6A6A]">
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </td>

        {/* Job ID */}
        <td className="px-3 py-3">
          <span className="font-mono text-xs text-[#AFAFAF]">{job.id}</span>
        </td>

        {/* Job name / type */}
        <td className="px-3 py-3">
          <span className="font-sans text-sm text-[#D0D0D0]">{job.name}</span>
        </td>

        {/* Attempts */}
        <td className="px-3 py-3 text-center">
          {isFailed && job.attemptsMade > 1 ? (
            <Badge className="border-[#5D1C1C] bg-[#1D0C0C] text-[#E4A7A7]">
              {job.attemptsMade}
            </Badge>
          ) : (
            <span className="font-sans text-sm text-[#9D9D9D]">{job.attemptsMade}</span>
          )}
        </td>

        {/* Added timestamp */}
        <td className="px-3 py-3">
          <span className="font-sans text-xs text-[#7A7A7A]">{formatMs(job.timestamp)}</span>
        </td>
      </tr>

      {/* Detail row — visible when expanded */}
      {expanded ? (
        <tr className={rowBg}>
          <td colSpan={5} className="px-4 pb-4 pt-1">
            <div className="space-y-3 rounded-xl border border-[#232323] bg-[#060606] p-4">
              {/* Timestamps grid */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-[#6A6A6A]">
                    {tAdmin("queue_jobs_modal_added")}
                  </p>
                  <p className="font-sans mt-0.5 text-sm text-[#C8C8C8]">
                    {formatMs(job.timestamp)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-[#6A6A6A]">
                    {tAdmin("queue_jobs_modal_started")}
                  </p>
                  <p className="font-sans mt-0.5 text-sm text-[#C8C8C8]">
                    {formatMs(job.processedOn)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-[#6A6A6A]">
                    {tAdmin("queue_jobs_modal_finished")}
                  </p>
                  <p className="font-sans mt-0.5 text-sm text-[#C8C8C8]">
                    {formatMs(job.finishedOn)}
                  </p>
                </div>
              </div>

              {/* Failed reason — only for failed state */}
              {isFailed && job.failedReason ? (
                <div>
                  <p className="font-sans mb-1 text-[11px] font-medium uppercase tracking-widest text-[#E4A7A7]">
                    {tAdmin("queue_jobs_modal_failed_reason")}
                  </p>
                  <div className="rounded-lg border border-[#5D1C1C] bg-[#1D0C0C] px-3 py-2">
                    <p className="font-mono text-sm text-[#E4A7A7] break-words">
                      {job.failedReason}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Stack trace — only for failed state */}
              {isFailed && job.stacktrace.length > 0 ? (
                <div>
                  <p className="font-sans mb-1 text-[11px] font-medium uppercase tracking-widest text-[#6A6A6A]">
                    {tAdmin("queue_jobs_modal_stacktrace")}
                  </p>
                  <pre className="max-h-48 overflow-y-auto rounded-lg border border-[#232323] bg-[#0A0A0A] p-3 font-mono text-xs text-[#AFAFAF] whitespace-pre-wrap break-words">
                    {job.stacktrace.join("\n")}
                  </pre>
                </div>
              ) : null}

              {/* Job payload */}
              {job.data && job.data !== "null" ? (
                <div>
                  <p className="font-sans mb-1 text-[11px] font-medium uppercase tracking-widest text-[#6A6A6A]">
                    {tAdmin("queue_jobs_modal_payload")}
                  </p>
                  <pre className="max-h-40 overflow-y-auto rounded-lg border border-[#232323] bg-[#0A0A0A] p-3 font-mono text-xs text-[#AFAFAF] whitespace-pre-wrap break-words">
                    {job.data}
                  </pre>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Public props & component
// ──────────────────────────────────────────────────────────────────────

interface AdminQueueJobsModalProps {
  open: boolean;
  onClose: () => void;
  queueName: string;
  state: string;
  /** Count displayed in the title badge — comes from the health panel snapshot */
  count: number;
}

export function AdminQueueJobsModal({
  open,
  onClose,
  queueName,
  state,
  count,
}: AdminQueueJobsModalProps) {
  const tAdmin = useTranslations("admin");
  const [page, setPage] = useState(0);
  const LIMIT = 10;

  // Reset page whenever the modal re-opens for a different queue/state
  const resolvedQueueName = open ? queueName : null;
  const resolvedState = open ? state : null;

  const { result, isFetching, isInitialLoading, isError } = useAdminQueueJobs(
    resolvedQueueName,
    resolvedState,
    page,
    LIMIT
  );

  const jobs = result?.jobs ?? [];
  const total = result?.total ?? 0;
  const start = page * LIMIT + 1;
  const end = Math.min(start + jobs.length - 1, total);
  const hasPrev = page > 0;
  const hasNext = end < total;

  const queueLabel = QUEUE_LABELS[queueName] ?? queueName;
  const stateLabel = STATE_LABELS[state] ?? state;

  function handleClose() {
    setPage(0);
    onClose();
  }

  function handlePrev() {
    setPage((p) => Math.max(0, p - 1));
  }

  function handleNext() {
    setPage((p) => p + 1);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto border border-[#1D1D1D] bg-[#0A0A0A] p-0 sm:max-w-3xl">
        {/* Header */}
        <DialogHeader className="border-b border-[#1D1D1D] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-display text-lg font-semibold text-white">
              {queueLabel}
            </DialogTitle>
            <Badge
              className={
                state === "failed"
                  ? "border-[#5D1C1C] bg-[#1D0C0C] text-[#E4A7A7]"
                  : state === "active"
                    ? "border-[#1C5D2F] bg-[#0C1D12] text-[#8DE4A7]"
                    : state === "waiting"
                      ? "border-[#4B3714] bg-[#1A1205] text-[#F6D58F]"
                      : "border-[#525252] bg-[#1A1A1A] text-[#D2D2D2]"
              }
            >
              {stateLabel}
            </Badge>
            <Badge className="border-[#525252] bg-[#1A1A1A] text-[#D2D2D2]">{count}</Badge>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-5 py-4">
          {isInitialLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="mr-2 size-5 animate-spin text-[#6A6A6A]" aria-hidden="true" />
              <span className="font-sans text-sm text-[#9D9D9D]">
                {tAdmin("queue_jobs_modal_loading")}
              </span>
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-[#5D1C1C] bg-[#1D0C0C] px-4 py-6 text-center">
              <p className="font-sans text-sm text-[#E4A7A7]">{tAdmin("queue_jobs_modal_error")}</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-[#232323] bg-[#0F0F0F] px-4 py-8 text-center">
              <p className="font-sans text-sm text-[#9D9D9D]">{tAdmin("queue_jobs_modal_empty")}</p>
            </div>
          ) : (
            <>
              {/* Job table */}
              <div className="overflow-hidden rounded-xl border border-[#1F1F1F]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px]">
                    <thead>
                      <tr className="border-b border-[#1F1F1F] bg-[#0A0A0A]">
                        {/* Expand col */}
                        <th className="w-8 px-3 py-2.5" />
                        <th className="font-sans px-3 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                          {tAdmin("queue_jobs_modal_job_id")}
                        </th>
                        <th className="font-sans px-3 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                          {tAdmin("queue_jobs_modal_job_type")}
                        </th>
                        <th className="font-sans px-3 py-2.5 text-center text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                          {tAdmin("queue_jobs_modal_attempts")}
                        </th>
                        <th className="font-sans px-3 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                          {tAdmin("queue_jobs_modal_added")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job, index) => (
                        <JobRow
                          key={job.id}
                          job={job}
                          state={state}
                          index={index}
                          tAdmin={tAdmin}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="font-sans text-xs text-[#7A7A7A]">
                  {total > 0 ? tAdmin("queue_jobs_modal_showing", { start, end, total }) : ""}
                </p>
                <div className="flex items-center gap-2">
                  {isFetching ? (
                    <Loader2 className="size-4 animate-spin text-[#6A6A6A]" aria-hidden="true" />
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasPrev || isFetching}
                    onClick={handlePrev}
                    className="rounded-full text-xs"
                  >
                    {tAdmin("queue_jobs_modal_prev")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasNext || isFetching}
                    onClick={handleNext}
                    className="rounded-full text-xs"
                  >
                    {tAdmin("queue_jobs_modal_next")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
