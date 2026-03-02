"use client";

import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddonCardProps {
  name: string;
  description: string | null;
  priceLabel: string;
  selected: boolean;
  disabled?: boolean;
  notice?: string;
  includedNote?: string;
  onToggle: () => void;
  ariaLabel: string;
}

const CARD_SPRING = { type: "spring", stiffness: 380, damping: 28, mass: 0.65 } as const;

export function AddonCard({
  name,
  description,
  priceLabel,
  selected,
  disabled = false,
  notice,
  includedNote,
  onToggle,
  ariaLabel,
}: AddonCardProps) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      whileTap={!disabled ? { scale: 0.995 } : undefined}
      transition={CARD_SPRING}
      animate={{
        scale: selected && !disabled ? 1.015 : 1,
        boxShadow: selected
          ? "0 14px 32px rgba(0,126,255,0.22)"
          : disabled
            ? "0 0 0 rgba(0,0,0,0)"
            : "0 0 0 rgba(0,0,0,0)",
      }}
      className={cn(
        "relative flex min-h-11 min-w-11 flex-col items-start gap-2.5 rounded-2xl border px-4 py-4 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black md:px-5 md:py-5",
        disabled
          ? "cursor-not-allowed border-[#2A2A2A] bg-[#111111] text-white/65"
          : selected
            ? "border-[#007eff] bg-[#080c12] text-white"
            : "border-[#2A2A2A] bg-black text-white/90 hover:border-[#007eff]"
      )}
    >
      <span
        className={cn(
          "absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border",
          disabled
            ? "border-[#3a3a3a] bg-[#1b1b1b] text-white/45"
            : selected
              ? "border-[#007eff] bg-[#007eff]/15 text-[#007eff]"
              : "border-[#2A2A2A] bg-transparent text-transparent"
        )}
        aria-hidden="true"
      >
        {disabled ? <Lock className="size-3" /> : selected ? <Check className="size-3" /> : null}
      </span>

      <span className="pr-8 font-sans text-base font-semibold text-white">{name}</span>
      <span className="font-sans text-lg font-semibold text-white">{priceLabel}</span>

      {description ? (
        <p
          className={cn(
            "font-sans text-sm leading-relaxed",
            disabled ? "text-white/50" : "text-white/65"
          )}
        >
          {description}
        </p>
      ) : null}

      {notice ? (
        <p className="font-sans text-xs leading-relaxed text-[#8f8f8f] italic">{notice}</p>
      ) : null}

      {includedNote ? (
        <p className="font-sans text-xs leading-relaxed text-[#8f8f8f]">{includedNote}</p>
      ) : null}
    </motion.button>
  );
}
