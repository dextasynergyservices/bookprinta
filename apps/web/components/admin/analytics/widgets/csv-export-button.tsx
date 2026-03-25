"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type CsvExportButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export function CsvExportButton({ onClick, disabled }: CsvExportButtonProps) {
  const t = useTranslations("admin");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 text-[#7D7D7D] hover:bg-[#1A1A1A] hover:text-white"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("web_analytics_export_csv")}
      title={t("web_analytics_export_csv")}
    >
      <Download className="size-3.5" />
    </Button>
  );
}
