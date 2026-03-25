import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BookLifecycleTone = "active" | "delivered" | "pending" | "issue";

const BOOK_ISSUE_STATUSES = new Set(["REJECTED", "CANCELLED"]);
const BOOK_DELIVERED_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const BOOK_PENDING_STATUSES = new Set([
  "AWAITING_UPLOAD",
  "UPLOADED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
]);

const TONE_CLASSNAMES: Record<BookLifecycleTone, string> = {
  active: "border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]",
  delivered: "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]",
  pending: "border-[#facc15]/45 bg-[#facc15]/15 text-[#facc15]",
  issue: "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#ef4444]",
};

function resolveBookTone(status: string | null | undefined): BookLifecycleTone {
  if (!status) return "pending";
  const normalized = status.toUpperCase().trim();
  if (BOOK_ISSUE_STATUSES.has(normalized)) return "issue";
  if (BOOK_DELIVERED_STATUSES.has(normalized)) return "delivered";
  if (BOOK_PENDING_STATUSES.has(normalized)) return "pending";
  return "active";
}

function toStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type BookStatusBadgeProps = {
  status: string | null | undefined;
  productionStatus?: string | null | undefined;
  label?: string;
  className?: string;
};

export function BookStatusBadge({
  status,
  productionStatus,
  label,
  className,
}: BookStatusBadgeProps) {
  const displayStatus = productionStatus ?? status;
  const tone = resolveBookTone(displayStatus);
  const badgeLabel = label ?? toStatusLabel(displayStatus);

  return (
    <Badge
      variant="outline"
      data-tone={tone}
      data-status={displayStatus ?? ""}
      className={cn(
        "rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        TONE_CLASSNAMES[tone],
        className
      )}
    >
      {badgeLabel}
    </Badge>
  );
}
