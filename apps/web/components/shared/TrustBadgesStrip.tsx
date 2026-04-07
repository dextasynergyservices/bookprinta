"use client";

import { Printer, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const DEXTA_LOGO_SRC =
  "https://res.cloudinary.com/dxoorukfj/image/upload/v1774885531/DEXTA_-_logo_3_f4ty2h.png";

interface TrustBadgesStripProps {
  securePaymentsLabel: string;
  qualityPrintsLabel: string;
  compact?: boolean;
  borderless?: boolean;
  className?: string;
}

export function TrustBadgesStrip({
  securePaymentsLabel,
  qualityPrintsLabel,
  compact = false,
  borderless = false,
  className,
}: TrustBadgesStripProps) {
  return (
    <div className={cn("flex flex-wrap items-stretch", compact ? "gap-2" : "gap-3", className)}>
      <div
        className={cn(
          "flex min-w-[15rem] flex-1 items-center gap-3 rounded-2xl text-white",
          borderless
            ? "border border-transparent bg-white/[0.02]"
            : "border border-white/10 bg-white/[0.03]",
          compact ? "px-3 py-2" : "px-4 py-3"
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-[#007eff]/35 bg-[#007eff]/12 text-[#7fd2ff]",
            compact ? "size-8" : "size-10"
          )}
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p
            className={cn(
              "font-sans uppercase text-white/52",
              compact ? "text-[10px] tracking-[0.1em]" : "text-[11px] tracking-[0.08em]"
            )}
          >
            {securePaymentsLabel}
          </p>
          <Image
            src="/logos/paystack-logo-white.svg"
            alt="Paystack"
            width={157}
            height={28}
            className={cn("mt-1 w-auto opacity-90", compact ? "h-4" : "h-5")}
          />
        </div>
      </div>

      <div
        className={cn(
          "flex min-w-[15rem] flex-1 items-center gap-3 rounded-2xl text-white",
          borderless
            ? "border border-transparent bg-white/[0.02]"
            : "border border-white/10 bg-white/[0.03]",
          compact ? "px-3 py-2" : "px-4 py-3"
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-[#007eff]/35 bg-[#007eff]/12 text-[#7fd2ff]",
            compact ? "size-8" : "size-10"
          )}
        >
          <Printer className="size-4" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p
            className={cn(
              "font-sans uppercase text-white/52",
              compact ? "text-[10px] tracking-[0.1em]" : "text-[11px] tracking-[0.08em]"
            )}
          >
            {qualityPrintsLabel}
          </p>
          <Image
            src={DEXTA_LOGO_SRC}
            alt="DEXTA"
            width={192}
            height={56}
            className={cn("mt-1 w-auto", compact ? "h-5" : "h-6")}
          />
        </div>
      </div>
    </div>
  );
}
