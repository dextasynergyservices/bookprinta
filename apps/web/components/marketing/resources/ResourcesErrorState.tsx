import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResourcesErrorStateProps {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ResourcesErrorState({ message, retryLabel, onRetry }: ResourcesErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-20 text-center md:py-24"
      role="alert"
    >
      <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111]">
        <TriangleAlertIcon className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>

      <p className="max-w-md font-sans text-sm text-white/80">{message}</p>

      {onRetry && retryLabel ? (
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="mt-6 border-[#2A2A2A] bg-[#111111] font-sans text-xs font-semibold uppercase tracking-[0.16em] text-[#007eff] hover:bg-[#2A2A2A] hover:text-[#007eff]"
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
