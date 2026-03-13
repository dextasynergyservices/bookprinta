"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type AdminBookPdfVerifierProps = {
  fileName: string;
  fileUrl: string;
  emptyLabel: string;
  loadingLabel: string;
  errorLabel: string;
  pageLabel: string;
  previousLabel: string;
  nextLabel: string;
};

function getFallbackPageWidth() {
  if (typeof window === "undefined") {
    return 300;
  }

  if (window.innerWidth < 768) {
    return Math.max(220, Math.min(window.innerWidth - 88, 320));
  }

  return Math.max(420, Math.min(window.innerWidth - 160, 760));
}

function getMeasuredPageWidth(containerWidth: number): number {
  return Math.max(180, Math.min(containerWidth - 24, 760));
}

export function AdminBookPdfVerifier({
  fileName,
  fileUrl,
  emptyLabel,
  loadingLabel,
  errorLabel,
  pageLabel,
  previousLabel,
  nextLabel,
}: AdminBookPdfVerifierProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageWidth, setPageWidth] = useState(getFallbackPageWidth);
  const [loadError, setLoadError] = useState(false);
  const documentPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (fileUrl.trim().length === 0) {
      setCurrentPage(1);
      setPageCount(null);
      setLoadError(true);
      return;
    }

    setCurrentPage(1);
    setPageCount(null);
    setLoadError(false);
  }, [fileUrl]);

  useEffect(() => {
    const handleResize = () => {
      const containerWidth = documentPanelRef.current?.clientWidth ?? 0;
      setPageWidth(
        containerWidth > 0 ? getMeasuredPageWidth(containerWidth) : getFallbackPageWidth()
      );
    };

    handleResize();
    const animationFrameId = window.requestAnimationFrame(handleResize);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
            PDF
          </p>
          <p className="font-sans mt-2 text-sm leading-6 text-white [overflow-wrap:anywhere]">
            {fileName}
          </p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-nowrap sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1 || loadError}
            className="min-h-10 w-full justify-center rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818] sm:w-auto"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {previousLabel}
          </Button>
          <span
            className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] px-4 py-2 text-center font-sans text-xs text-[#D0D0D0] sm:w-auto"
            aria-live="polite"
          >
            {pageCount
              ? pageLabel
                  .replace("{page}", String(currentPage))
                  .replace("{count}", String(pageCount))
              : emptyLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.min(pageCount ?? page, page + 1))}
            disabled={loadError || pageCount === null || currentPage >= pageCount}
            className="min-h-10 w-full justify-center rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818] sm:w-auto"
          >
            {nextLabel}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        ref={documentPanelRef}
        className="overflow-x-auto overflow-y-hidden rounded-[1.35rem] border border-[#202020] bg-[#050505] p-3 md:p-4"
      >
        <Document
          file={fileUrl}
          loading={
            <div className="flex min-h-[18rem] items-center justify-center gap-3 rounded-[1rem] border border-dashed border-[#2A2A2A] bg-[#0B0B0B] text-[#A8A8A8]">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="font-sans text-sm">{loadingLabel}</span>
            </div>
          }
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setCurrentPage((page) => Math.min(page, numPages));
            setLoadError(false);
          }}
          onLoadError={() => {
            setLoadError(true);
          }}
          error={
            <div className="flex min-h-[18rem] items-center justify-center rounded-[1rem] border border-dashed border-[#4A1616] bg-[#140909] px-4 text-center">
              <p className="font-sans text-sm text-[#FFC5C5]">{errorLabel}</p>
            </div>
          }
        >
          <Page
            pageNumber={currentPage}
            width={pageWidth}
            loading={null}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}
