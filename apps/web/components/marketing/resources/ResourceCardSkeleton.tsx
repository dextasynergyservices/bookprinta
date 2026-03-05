import { Skeleton } from "@/components/ui/skeleton";

export function ResourceCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#111111]">
      <Skeleton className="aspect-[16/10] w-full rounded-none bg-white/10" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-24 rounded-full bg-white/10" />
        <Skeleton className="h-6 w-4/5 bg-white/10" />
        <Skeleton className="h-4 w-full bg-white/10" />
        <Skeleton className="h-4 w-2/3 bg-white/10" />
        <Skeleton className="h-4 w-28 bg-white/10" />
      </div>
    </article>
  );
}
