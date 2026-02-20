"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ShowcaseCategory, ShowcaseFilters, ShowcaseSortOption } from "@/types/showcase";

interface ShowcaseFiltersBarProps {
  filters: ShowcaseFilters;
  onFilterChange: (updates: Partial<ShowcaseFilters>) => void;
  categories: ShowcaseCategory[];
  availableYears: number[];
}

export function ShowcaseFiltersBar({
  filters,
  onFilterChange,
  categories,
  availableYears,
}: ShowcaseFiltersBarProps) {
  const t = useTranslations("showcase");

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-5">
      {/* Category pills — horizontally scrollable on mobile */}
      <div
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-5 sm:px-5 md:mx-0 md:flex-wrap md:gap-2 md:px-0 md:pb-0"
        role="tablist"
        aria-label={t("filter_category")}
      >
        <CategoryPill
          active={!filters.category}
          onClick={() => onFilterChange({ category: "" })}
          label={t("all_categories")}
        />
        {categories.map((cat) => (
          <CategoryPill
            key={cat.id}
            active={filters.category === cat.slug}
            onClick={() => onFilterChange({ category: cat.slug })}
            label={cat.name}
          />
        ))}
      </div>

      {/* Sort + Year dropdowns */}
      <div className="flex shrink-0 gap-2">
        <Select
          value={filters.sort}
          onValueChange={(value: ShowcaseSortOption) => onFilterChange({ sort: value })}
        >
          <SelectTrigger
            size="sm"
            className="min-w-28 border-border/50 bg-transparent font-sans text-xs font-medium md:min-w-32.5"
            aria-label={t("filter_sort")}
          >
            <SelectValue placeholder={t("filter_sort")} />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value="date_desc">{t("sort_newest")}</SelectItem>
            <SelectItem value="date_asc">{t("sort_oldest")}</SelectItem>
            <SelectItem value="title_asc">{t("sort_az")}</SelectItem>
            <SelectItem value="title_desc">{t("sort_za")}</SelectItem>
          </SelectContent>
        </Select>

        {availableYears.length > 0 && (
          <Select
            value={filters.year || "all"}
            onValueChange={(value) => onFilterChange({ year: value === "all" ? "" : value })}
          >
            <SelectTrigger
              size="sm"
              className="min-w-20 border-border/50 bg-transparent font-sans text-xs font-medium md:min-w-25"
              aria-label={t("filter_year")}
            >
              <SelectValue placeholder={t("filter_year")} />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="all">{t("filter_year_all")}</SelectItem>
              {availableYears.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function CategoryPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center px-3 py-2.5 font-sans text-[0.6875rem] font-semibold uppercase tracking-wider transition-all duration-300 md:px-4 md:py-2 md:text-xs",
        "focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-transparent text-muted-foreground active:text-foreground md:hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
