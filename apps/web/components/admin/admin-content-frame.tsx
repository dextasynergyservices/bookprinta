import { cn } from "@/lib/utils";

type AdminContentFrameProps = {
  children: React.ReactNode;
  className?: string;
};

export function AdminContentFrame({ children, className }: AdminContentFrameProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 max-w-[1520px] flex-1 flex-col gap-3 px-4 py-4 md:gap-4 md:px-6 md:py-5 lg:px-8 lg:py-6",
        "[--admin-sticky-offset:calc(env(safe-area-inset-top)+4.5rem)] md:[--admin-sticky-offset:calc(env(safe-area-inset-top)+5rem)]",
        className
      )}
    >
      {children}
    </div>
  );
}
