import { Skeleton } from "@/components/ui/skeleton";

export function ShowcaseCardSkeleton() {
  return (
    <article className="relative flex flex-col overflow-hidden bg-primary">
      {/* Cover image skeleton — full aspect ratio, no rounded corners */}
      <div className="relative aspect-3/4 w-full overflow-hidden">
        <Skeleton className="size-full rounded-none bg-white/10" />

        {/* Overlay content skeleton */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 p-5 md:p-6">
          {/* Category badge */}
          <Skeleton className="h-5 w-16 rounded-full bg-white/10" />

          {/* Title */}
          <Skeleton className="h-6 w-4/5 bg-white/10" />

          {/* Author name */}
          <Skeleton className="h-4 w-2/5 bg-white/10" />

          {/* Year */}
          <Skeleton className="h-3 w-12 bg-white/10" />
        </div>
      </div>
    </article>
  );
}
