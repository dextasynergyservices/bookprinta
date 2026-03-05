import { Badge } from "@/components/ui/badge";
import { isReprintOrderType } from "@/lib/api/orders-contract";
import { cn } from "@/lib/utils";

type ReprintBadgeProps = {
  orderType: string | null | undefined;
  label?: string;
  className?: string;
};

function toDefaultReprintLabel(orderType: string | null | undefined): string {
  if (!orderType) return "—";

  return orderType.toUpperCase().split("_").join(" ");
}

export function ReprintBadge({ orderType, label, className }: ReprintBadgeProps) {
  if (!isReprintOrderType(orderType)) {
    return null;
  }

  const badgeLabel = label ?? toDefaultReprintLabel(orderType);

  return (
    <Badge
      variant="outline"
      data-order-type={orderType ?? ""}
      className={cn(
        "rounded-full border border-[#ff7a00]/50 bg-[#ff7a00]/20 px-2.5 py-1 font-sans text-[10px] leading-none font-semibold tracking-[0.05em] text-[#ff7a00]",
        className
      )}
    >
      {badgeLabel}
    </Badge>
  );
}
