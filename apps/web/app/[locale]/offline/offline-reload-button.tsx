"use client";

import { RotateCw } from "lucide-react";
import { reloadCurrentPage } from "./reload-page";

type OfflineReloadButtonProps = {
  label: string;
};

export function OfflineReloadButton({ label }: OfflineReloadButtonProps) {
  return (
    <button
      type="button"
      onClick={reloadCurrentPage}
      className="inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-[#007eff] px-6 font-sans text-sm font-bold text-white transition-all duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <RotateCw className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
