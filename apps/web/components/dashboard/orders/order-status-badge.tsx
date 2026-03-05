import { Badge } from "@/components/ui/badge";
import { resolveOrderLifecycle } from "@/lib/api/orders-contract";
import { cn } from "@/lib/utils";
import type { OrderLifecycleTone } from "@/types/orders";

const STATUS_TONE_CLASSNAMES: Record<OrderLifecycleTone, string> = {
  active: "border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]",
  delivered: "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]",
  pending: "border-[#facc15]/45 bg-[#facc15]/15 text-[#facc15]",
  issue: "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#ef4444]",
};

function toStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type OrderStatusBadgeProps = {
  orderStatus: string | null | undefined;
  bookStatus?: string | null | undefined;
  label?: string;
  className?: string;
};

export function OrderStatusBadge({
  orderStatus,
  bookStatus,
  label,
  className,
}: OrderStatusBadgeProps) {
  const lifecycle = resolveOrderLifecycle({
    orderStatus,
    bookStatus,
  });

  const badgeLabel = label ?? toStatusLabel(lifecycle.sourceStatus ?? orderStatus ?? bookStatus);

  return (
    <Badge
      variant="outline"
      data-tone={lifecycle.tone}
      data-status-source={lifecycle.source}
      data-status={lifecycle.sourceStatus ?? ""}
      className={cn(
        "rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        STATUS_TONE_CLASSNAMES[lifecycle.tone],
        className
      )}
    >
      {badgeLabel}
    </Badge>
  );
}
