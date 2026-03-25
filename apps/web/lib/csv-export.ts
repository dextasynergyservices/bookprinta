/**
 * Generate a CSV string from an array of objects and trigger a download.
 * Pure frontend — no backend call needed.
 */
export function downloadCsv(
  rows: Record<string, string | number | null | undefined>[],
  filename: string
): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((key) => {
          const value = row[key];
          if (value === null || value === undefined) return "";
          const str = String(value);
          // Escape values containing commas, quotes, or newlines
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
