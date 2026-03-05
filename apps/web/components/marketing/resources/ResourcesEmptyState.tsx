import { BookOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResourcesEmptyStateProps {
  title: string;
  description: string;
  clearLabel?: string;
  hasActiveFilter?: boolean;
  onClear?: () => void;
}

export function ResourcesEmptyState({
  title,
  description,
  clearLabel,
  hasActiveFilter = false,
  onClear,
}: ResourcesEmptyStateProps) {
  return (
    <output className="flex flex-col items-center justify-center px-4 py-24 text-center md:py-32">
      <div className="mb-8 flex size-20 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] md:size-24">
        <BookOpenIcon className="size-10 text-[#007eff] md:size-12" aria-hidden="true" />
      </div>

      <h3 className="font-display text-xl font-bold tracking-tight text-white md:text-2xl">
        {title}
      </h3>

      <p className="mt-3 max-w-md font-serif text-sm leading-relaxed text-white/70 md:text-base">
        {description}
      </p>

      {hasActiveFilter && onClear && clearLabel ? (
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          className="mt-8 border-[#2A2A2A] bg-[#111111] font-sans text-xs font-semibold uppercase tracking-[0.16em] text-[#007eff] hover:bg-[#2A2A2A] hover:text-[#007eff]"
        >
          {clearLabel}
        </Button>
      ) : null}
    </output>
  );
}
