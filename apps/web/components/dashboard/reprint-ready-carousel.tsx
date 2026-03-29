"use client";

import type { BookReprintConfigResponse, OrdersListItem } from "@bookprinta/shared";
import { useQueries } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bookReprintConfigQueryKeys,
  fetchBookReprintConfig,
} from "@/hooks/use-book-reprint-config";
import { formatDashboardCurrency } from "@/lib/dashboard/dashboard-formatters";
import {
  DASHBOARD_STATUS_STALE_TIME_MS,
  dashboardBaseQueryOptions,
} from "@/lib/dashboard/query-defaults";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { PRIMARY_BUTTON_CLASS } from "./dashboard-overview-shared";

const AUTO_CYCLE_INTERVAL_MS = 6_000;

type ReprintReadyCarouselProps = {
  orders: OrdersListItem[];
  onReprintClick: (bookId: string) => void;
};

type CarouselSlideData = {
  bookId: string;
  orderId: string;
  orderNumber: string;
  config: BookReprintConfigResponse | null;
  isLoading: boolean;
};

export function ReprintReadyCarousel({ orders, onReprintClick }: ReprintReadyCarouselProps) {
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const bookIds = useMemo(
    () => orders.map((o) => o.book?.id).filter((id): id is string => typeof id === "string"),
    [orders]
  );

  const configQueries = useQueries({
    queries: bookIds.map((bookId) => ({
      queryKey: bookReprintConfigQueryKeys.detail(bookId),
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchBookReprintConfig({ bookId, signal }),
      ...dashboardBaseQueryOptions,
      staleTime: DASHBOARD_STATUS_STALE_TIME_MS,
      enabled: true,
      refetchOnWindowFocus: true,
    })),
  });

  const allSlides: CarouselSlideData[] = useMemo(
    () =>
      orders
        .reduce<{ order: OrdersListItem; bookId: string }[]>((acc, order) => {
          const id = order.book?.id;
          if (id) acc.push({ order, bookId: id });
          return acc;
        }, [])
        .map(({ order, bookId }, index) => ({
          bookId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          config: configQueries[index]?.data ?? null,
          isLoading: configQueries[index]?.isPending ?? true,
        })),
    [orders, configQueries]
  );

  // Hide books that already have an active reprint once their config loads.
  const slides = useMemo(
    () => allSlides.filter((s) => s.isLoading || s.config?.canReprintSame !== false),
    [allSlides]
  );

  const total = slides.length;
  const safeIndex = total > 0 ? activeIndex % total : 0;

  // Reset index when slides are removed (e.g. config reveals active reprint)
  useEffect(() => {
    if (total > 0 && activeIndex >= total) {
      setActiveIndex(0);
    }
  }, [total, activeIndex]);

  const goTo = useCallback(
    (next: number, dir: number) => {
      if (total <= 1) return;
      setDirection(dir);
      setActiveIndex(((next % total) + total) % total);
    },
    [total]
  );

  const goNext = useCallback(() => goTo(activeIndex + 1, 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1, -1), [activeIndex, goTo]);

  // Auto-cycle
  useEffect(() => {
    if (total <= 1) return;

    timerRef.current = setInterval(goNext, AUTO_CYCLE_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [total, goNext]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (total > 1) {
      timerRef.current = setInterval(goNext, AUTO_CYCLE_INTERVAL_MS);
    }
  }, [total, goNext]);

  // Swipe support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = touchStartXRef.current;
      if (startX === null) return;
      const endX = e.changedTouches[0]?.clientX ?? startX;
      const diff = startX - endX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) goNext();
        else goPrev();
        resetTimer();
      }
      touchStartXRef.current = null;
    },
    [goNext, goPrev, resetTimer]
  );

  if (total === 0) return null;

  const currentSlide = slides[safeIndex];
  if (!currentSlide) return null;

  const bookTitle = currentSlide.config?.bookTitle ?? tDashboard("overview_active_book_untitled");
  const costPerCopy = currentSlide.config?.costPerCopy ?? null;
  const priceLabel = costPerCopy !== null ? formatDashboardCurrency(costPerCopy, locale) : null;

  return (
    <div
      className="relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={currentSlide.bookId}
          custom={direction}
          initial={{ opacity: 0, x: direction >= 0 ? 40 : -40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction >= 0 ? -40 : 40 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[#0C0C0E] p-4 md:p-5"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,126,255,0.08) 0%, rgba(0,0,0,0) 34%), radial-gradient(60% 46% at 100% 0%, rgba(0,126,255,0.10) 0%, rgba(0,0,0,0) 72%)",
            }}
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D8D8D]">
                  {currentSlide.orderNumber}
                </p>
                <h3 className="font-display mt-3 text-[1.75rem] leading-[1.05] font-semibold tracking-[-0.04em] text-white md:text-[2rem] md:leading-[0.98]">
                  {currentSlide.isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-5 animate-spin text-[#8D8D8D]" aria-hidden="true" />
                      <span className="text-[#8D8D8D]">
                        {tDashboard("overview_reprint_ready_badge")}
                      </span>
                    </span>
                  ) : (
                    bookTitle
                  )}
                </h3>
                {!currentSlide.isLoading && priceLabel !== null && (
                  <p className="mt-2 font-serif text-base leading-7 text-[#9FD0FF]">
                    {tDashboard("reprint_carousel_at_price", { price: priceLabel })}
                  </p>
                )}
              </div>
              <span className="font-sans inline-flex shrink-0 min-h-8 items-center rounded-full border border-[#007eff]/30 bg-[#0B1A2A] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#CBE4FF]">
                {tDashboard("overview_reprint_ready_badge")}
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <Button
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => {
                  onReprintClick(currentSlide.bookId);
                  resetTimer();
                }}
                disabled={currentSlide.isLoading}
              >
                {tDashboard("reprint_same")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {total > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              goPrev();
              resetTimer();
            }}
            className="inline-flex size-8 items-center justify-center rounded-full border border-white/10 text-[#8D8D8D] transition-colors hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
            aria-label={tDashboard("reprint_carousel_prev")}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2" role="tablist">
            {slides.map((slide, i) => (
              <button
                key={slide.bookId}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`${i + 1} / ${total}`}
                onClick={() => {
                  goTo(i, i > safeIndex ? 1 : -1);
                  resetTimer();
                }}
                className={cn(
                  "size-2 rounded-full transition-all duration-300",
                  i === safeIndex ? "w-5 bg-[#007eff]" : "bg-white/20 hover:bg-white/40"
                )}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              goNext();
              resetTimer();
            }}
            className="inline-flex size-8 items-center justify-center rounded-full border border-white/10 text-[#8D8D8D] transition-colors hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
            aria-label={tDashboard("reprint_carousel_next")}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
