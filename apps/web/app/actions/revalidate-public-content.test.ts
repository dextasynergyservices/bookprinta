/**
 * On-demand revalidation of admin-managed public content.
 *
 * Two properties matter and neither is obvious from reading the call site:
 *
 *  1. Paths use the dynamic `[locale]` segment with `type: "page"`. A concrete
 *     path like "/pricing" revalidates exactly ONE locale and leaves /fr and
 *     /es serving stale content — a bug that would only show up for non-English
 *     visitors, i.e. the people least likely to report it.
 *
 *  2. It never throws. It runs from a mutation's success handler after the write
 *     has committed, so turning a cache-hint failure into a caller error would
 *     report a successful save as a failure.
 */
const revalidatePathMock = jest.fn();

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

import { revalidatePublicContent } from "./revalidate-public-content";

describe("revalidatePublicContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("revalidates every locale variant by using the dynamic segment", async () => {
    await revalidatePublicContent("pricing");

    // "page" + "[locale]" is what covers /, /fr and /es in one call.
    expect(revalidatePathMock).toHaveBeenCalledWith("/[locale]", "page");
    expect(revalidatePathMock).toHaveBeenCalledWith("/[locale]/pricing", "page");
  });

  it("includes the homepage for showcase changes, which renders featured authors", async () => {
    await revalidatePublicContent("showcase");

    expect(revalidatePathMock).toHaveBeenCalledWith("/[locale]", "page");
    expect(revalidatePathMock).toHaveBeenCalledWith("/[locale]/showcase", "page");
  });

  it("revalidates the article detail route as well as the resources index", async () => {
    await revalidatePublicContent("resources");

    expect(revalidatePathMock).toHaveBeenCalledWith("/[locale]/resources", "page");
    // Editing an article has to refresh the article's own page, not just the list.
    expect(revalidatePathMock).toHaveBeenCalledWith("/[locale]/resources/[slug]", "page");
  });

  it("never uses a route group segment, which is not part of the URL", async () => {
    await revalidatePublicContent("pricing");
    await revalidatePublicContent("showcase");
    await revalidatePublicContent("resources");

    for (const [path] of revalidatePathMock.mock.calls) {
      expect(String(path)).not.toContain("(");
    }
  });

  it("swallows a revalidation failure so a committed save is not reported as an error", async () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error("revalidation unavailable");
    });

    await expect(revalidatePublicContent("pricing")).resolves.toBeUndefined();
  });
});
