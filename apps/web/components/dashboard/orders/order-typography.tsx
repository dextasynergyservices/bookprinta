import type * as React from "react";
import { cn } from "@/lib/utils";

export const ORDER_REFERENCE_TEXT_CLASS =
  "font-display text-sm font-bold tracking-tight text-white md:text-base";

export const ORDER_META_TEXT_CLASS = "font-sans text-xs font-medium text-[#d5d5d5] md:text-sm";

type OrderTextProps = {
  className?: string;
  children: React.ReactNode;
};

export function OrderReferenceText({ className, children }: OrderTextProps) {
  return <span className={cn(ORDER_REFERENCE_TEXT_CLASS, className)}>{children}</span>;
}

export function OrderMetaText({ className, children }: OrderTextProps) {
  return <span className={cn(ORDER_META_TEXT_CLASS, className)}>{children}</span>;
}
