"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

interface ShowcaseSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ShowcaseSearch({ value, onChange }: ShowcaseSearchProps) {
  const t = useTranslations("showcase");
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        onChange(newValue);
      }, 300);
    },
    [onChange]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleClear = useCallback(() => {
    setLocalValue("");
    onChange("");
  }, [onChange]);

  return (
    <div className="group relative w-full">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground transition-colors duration-300 group-focus-within:text-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("search_placeholder")}
        className="h-12 w-full border-0 border-b border-border/50 bg-transparent pl-7 pr-8 font-sans text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors duration-300 focus:border-foreground focus:outline-none md:h-14 md:text-base"
        aria-label={t("search_placeholder")}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute top-1/2 right-0 -translate-y-1/2 p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
          aria-label={t("clear_search")}
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
