export type BookPreviewTarget = {
  previewPdfUrl: string;
  signedPdfUrl?: string | null;
};

/**
 * Opens a book preview PDF in a new browser tab.
 *
 * Direct CDN Optimization:
 * When signedPdfUrl is present, fetches the file directly from Cloudinary CDN
 * (zero Render outbound bandwidth), wraps the response as an application/pdf blob,
 * and opens it inline in the browser's PDF viewer.
 *
 * Resilience & Fallback:
 * If the CDN fetch encounters any issue (CORS, network error, expired signature),
 * it silently falls back to navigating the window to the server-side proxy URL (previewPdfUrl).
 */
export async function openBookPdfPreview(
  preview: BookPreviewTarget,
  existingWindow?: Window | null
): Promise<void> {
  if (typeof window === "undefined") return;

  const targetWindow =
    existingWindow ?? window.open("about:blank", "_blank", "noopener,noreferrer");

  if (preview.signedPdfUrl) {
    try {
      const response = await fetch(preview.signedPdfUrl);
      if (response.ok) {
        const rawBlob = await response.blob();
        const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(pdfBlob);

        if (targetWindow && !targetWindow.closed) {
          targetWindow.location.href = objectUrl;
          return;
        }
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        return;
      }
    } catch (err) {
      console.warn("Direct CDN preview fetch failed, falling back to proxy endpoint:", err);
    }
  }

  // Fallback to proxy preview URL
  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = preview.previewPdfUrl;
  } else {
    window.open(preview.previewPdfUrl, "_blank", "noopener,noreferrer");
  }
}
