import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useRefreshAfterManuscriptUpload } from "./use-refresh-after-manuscript-upload";

describe("useRefreshAfterManuscriptUpload", () => {
  it("marks every view an upload changes as stale, and nothing else", async () => {
    const queryClient = new QueryClient();
    const seed = (queryKey: readonly unknown[]) => queryClient.setQueryData(queryKey, {});
    const affected = [
      ["book-progress", "detail", "book_1"],
      ["book-resource", "files", "book_1"],
      ["user-books", "list", 1, 10],
      ["dashboard", "overview"],
      ["orders", "list", 1, 10],
      ["orders", "detail", "order_1"],
      ["order-tracking", "detail", "order_1"],
    ];
    const unaffected = ["dashboard", "notifications", "unread-count"];
    for (const key of [...affected, unaffected]) seed(key);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRefreshAfterManuscriptUpload(), { wrapper });

    await result.current();

    for (const key of affected) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(unaffected)?.isInvalidated).toBe(false);
  });
});
