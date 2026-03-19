import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminResourcesWorkspaceView } from "./AdminResourcesWorkspaceView";

const routerReplaceMock = jest.fn();

const useAdminResourceCategoriesMock = jest.fn();
const useAdminResourcesMock = jest.fn();
const useAdminResourceDetailMock = jest.fn();
const useAdminResourceSlugAvailabilityMock = jest.fn();
const useCreateAdminResourceCategoryMutationMock = jest.fn();
const useCreateAdminResourceMutationMock = jest.fn();
const useDeleteAdminResourceMutationMock = jest.fn();
const useToggleAdminResourcePublishedMutationMock = jest.fn();
const useUpdateAdminResourceMutationMock = jest.fn();
const useDeleteAdminResourceCategoryMutationMock = jest.fn();
const useReorderAdminResourceCategoryMutationMock = jest.fn();
const useToggleAdminResourceCategoryActiveMutationMock = jest.fn();
const useUpdateAdminResourceCategoryMutationMock = jest.fn();
const useAdminResourceCoverUploadMutationMock = jest.fn();

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "resources_cover_uploading" && typeof values?.progress === "number") {
      return `${key}:${values.progress}`;
    }

    return key;
  },
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/resources",
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
  useSearchParams: () => new URLSearchParams(""),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/hooks/useAdminResources", () => ({
  useAdminResourceCategories: () => useAdminResourceCategoriesMock(),
  useAdminResources: (...args: unknown[]) => useAdminResourcesMock(...args),
  useAdminResourceDetail: () => useAdminResourceDetailMock(),
  useAdminResourceSlugAvailability: (...args: unknown[]) =>
    useAdminResourceSlugAvailabilityMock(...args),
  useCreateAdminResourceCategoryMutation: () => useCreateAdminResourceCategoryMutationMock(),
  useCreateAdminResourceMutation: () => useCreateAdminResourceMutationMock(),
  useDeleteAdminResourceMutation: () => useDeleteAdminResourceMutationMock(),
  useToggleAdminResourcePublishedMutation: () => useToggleAdminResourcePublishedMutationMock(),
  useUpdateAdminResourceMutation: () => useUpdateAdminResourceMutationMock(),
  useDeleteAdminResourceCategoryMutation: () => useDeleteAdminResourceCategoryMutationMock(),
  useReorderAdminResourceCategoryMutation: () => useReorderAdminResourceCategoryMutationMock(),
  useToggleAdminResourceCategoryActiveMutation: () =>
    useToggleAdminResourceCategoryActiveMutationMock(),
  useUpdateAdminResourceCategoryMutation: () => useUpdateAdminResourceCategoryMutationMock(),
  useAdminResourceCoverUploadMutation: () => useAdminResourceCoverUploadMutationMock(),
}));

function createDefaultHooks() {
  useAdminResourceCategoriesMock.mockReturnValue({
    categories: [
      {
        id: "cat-1",
        name: "Guides",
        slug: "guides",
        articleCount: 1,
        sortOrder: 0,
        isActive: true,
      },
    ],
    isInitialLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

  useAdminResourcesMock.mockReturnValue({
    items: [
      {
        id: "resource-1",
        title: "How to Start Publishing",
        slug: "how-to-start-publishing",
        category: { id: "cat-1", name: "Guides", slug: "guides" },
        isPublished: false,
        updatedAt: "2026-03-19T10:00:00.000Z",
      },
    ],
    hasMore: false,
    nextCursor: null,
    isInitialLoading: false,
    isError: false,
    isPageTransitioning: false,
    refetch: jest.fn(),
  });

  useAdminResourceDetailMock.mockReturnValue({
    data: null,
    isInitialLoading: false,
    isError: false,
  });

  useAdminResourceSlugAvailabilityMock.mockReturnValue({
    isChecking: false,
    isAvailable: true,
    data: { slug: "how-to-start-publishing", isAvailable: true },
  });

  useCreateAdminResourceCategoryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });

  useCreateAdminResourceMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });

  useDeleteAdminResourceMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ deleted: true }),
  });

  useToggleAdminResourcePublishedMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ id: "resource-1", isPublished: true }),
  });

  useUpdateAdminResourceMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });

  useDeleteAdminResourceCategoryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });

  useReorderAdminResourceCategoryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });

  useToggleAdminResourceCategoryActiveMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });

  useUpdateAdminResourceCategoryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });

  useAdminResourceCoverUploadMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn(),
  });
}

describe("AdminResourcesWorkspaceView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createDefaultHooks();
  });

  it("shows validation feedback for empty category create form", async () => {
    const user = userEvent.setup();
    render(<AdminResourcesWorkspaceView />);

    await user.click(screen.getByRole("button", { name: "resources_category_action_create" }));

    expect(
      await screen.findByText("resources_category_validation_name_required")
    ).toBeInTheDocument();
  });

  it("updates URL query params when search filter changes", async () => {
    const user = userEvent.setup();
    render(<AdminResourcesWorkspaceView />);

    const searchInput = screen.getByLabelText("resources_article_field_search");
    await user.type(searchInput, "guide");

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalled();
    });

    const calls = routerReplaceMock.mock.calls.map((call) => String(call[0]));
    expect(calls.some((value) => value.includes("q=guide"))).toBe(true);
  });

  it("supports publish toggle and article delete action flows", async () => {
    const user = userEvent.setup();
    render(<AdminResourcesWorkspaceView />);

    const openMenuButton = screen.getAllByRole("button", {
      name: "resources_articles_actions_open_menu",
    })[0];

    await user.click(openMenuButton);
    await user.click(screen.getByRole("menuitem", { name: "resources_article_action_publish" }));

    await waitFor(() => {
      expect(
        useToggleAdminResourcePublishedMutationMock.mock.results[0]?.value.mutateAsync
      ).toHaveBeenCalledWith({ resourceId: "resource-1", isPublished: true });
    });

    await user.click(openMenuButton);
    await user.click(screen.getByRole("menuitem", { name: "resources_article_action_delete" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "resources_article_delete_confirm_confirm",
      })
    );

    await waitFor(() => {
      expect(
        useDeleteAdminResourceMutationMock.mock.results[0]?.value.mutateAsync
      ).toHaveBeenCalledWith("resource-1");
    });
  });

  it("shows upload progress while creating an article cover", async () => {
    const user = userEvent.setup();
    let pending = false;
    const seenProgress: number[] = [];

    const mutateAsync = jest
      .fn()
      .mockImplementation(async (params: { onProgress?: (percentage: number) => void }) => {
        pending = true;
        params.onProgress?.(42);
        seenProgress.push(42);
        await Promise.resolve();
        pending = false;
        return { coverImageUrl: "https://res.cloudinary.com/demo/image/upload/cover.png" };
      });

    useAdminResourceCoverUploadMutationMock.mockReturnValue({
      get isPending() {
        return pending;
      },
      mutateAsync,
    });

    render(<AdminResourcesWorkspaceView />);

    const fileInput = screen.getAllByLabelText("resources_cover_field")[0];
    const file = new File(["cover"], "cover.png", { type: "image/png" });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });

    expect(seenProgress).toContain(42);
    expect(await screen.findByText("resources_cover_uploaded")).toBeInTheDocument();
  });
});
