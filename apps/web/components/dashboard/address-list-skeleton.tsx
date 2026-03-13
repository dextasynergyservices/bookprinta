"use client";

const SKELETON_KEYS = ["address-skeleton-1", "address-skeleton-2", "address-skeleton-3"] as const;

export function AddressListSkeleton() {
  return (
    <div data-testid="address-list-skeleton" className="grid gap-4">
      {SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="animate-pulse rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5"
        >
          <div className="space-y-4">
            <div className="h-7 w-40 rounded-full bg-[#1E1E1E]" />
            <div className="space-y-2">
              <div className="h-4 w-32 rounded-full bg-[#1A1A1A]" />
              <div className="h-4 w-full rounded-full bg-[#151515]" />
              <div className="h-4 w-4/5 rounded-full bg-[#151515]" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="h-11 w-full rounded-full bg-[#181818] sm:w-32" />
              <div className="h-11 w-full rounded-full bg-[#181818] sm:w-36" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
