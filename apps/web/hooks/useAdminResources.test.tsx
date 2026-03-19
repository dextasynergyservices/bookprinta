import { renderHook } from "@testing-library/react";
import {
  adminResourcesQueryKeys,
  useAdminResourceSlugAvailability,
  useAdminResources,
  useToggleAdminResourcePublishedMutation,
} from "./useAdminResources";

const useQueryMock = jest.fn();
const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();

jest.mock("@/lib/api/admin-resources", () => ({
  createAdminResource: jest.fn(),
  createAdminResourceCategory: jest.fn(),
  deleteAdminResource: jest.fn(),
  deleteAdminResourceCategory: jest.fn(),
  fetchAdminResourceCategories: jest.fn(),
  fetchAdminResourceDetail: jest.fn(),
  fetchAdminResourceSlugAvailability: jest.fn().mockResolvedValue({
    slug: "hello-world",
    isAvailable: true,
  }),
  fetchAdminResources: jest.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  }),
  updateAdminResource: jest.fn().mockResolvedValue({ id: "resource-1", isPublished: true }),
  updateAdminResourceCategory: jest.fn(),
  uploadAdminResourceCover: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
  useMutation: (options: unknown) => {
    useMutationMock(options);
    return options;
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    cancelQueries: jest.fn(),
    getQueriesData: jest.fn().mockReturnValue([]),
    setQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  }),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled?: boolean;
};

type MutationOptionsShape = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess?: (_data: unknown, _variables: unknown) => Promise<void>;
};

describe("useAdminResources", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateQueriesMock.mockResolvedValue(undefined);
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: "resource-1",
            title: "How to publish",
            slug: "how-to-publish",
            category: null,
            isPublished: false,
            updatedAt: "2026-03-19T08:00:00.000Z",
          },
        ],
        nextCursor: "cursor-2",
        hasMore: true,
      },
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
    });
  });

  it("builds a normalized query key for the resources list", () => {
    const { result } = renderHook(() =>
      useAdminResources({
        cursor: " cursor-1 ",
        limit: 20,
        q: "  writing  ",
        categoryId: " cat-1 ",
        isPublished: false,
      })
    );

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(
      adminResourcesQueryKeys.resourceList({
        cursor: "cursor-1",
        limit: 20,
        q: "writing",
        categoryId: "cat-1",
        isPublished: "false",
      })
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
  });

  it("normalizes slug availability queries and enables only for non-empty slugs", () => {
    renderHook(() =>
      useAdminResourceSlugAvailability(
        {
          slug: "  Hello-World  ",
          excludeId: " resource-1 ",
        },
        true
      )
    );

    let options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(
      adminResourcesQueryKeys.slugAvailability("hello-world", "resource-1")
    );
    expect(options.enabled).toBe(true);

    jest.clearAllMocks();
    useQueryMock.mockReturnValue({ data: undefined, isFetching: false });

    renderHook(() => useAdminResourceSlugAvailability({ slug: "   " }, true));

    options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.enabled).toBe(false);
  });

  it("invalidates admin and public caches after publish toggle mutation", async () => {
    renderHook(() => useToggleAdminResourcePublishedMutation());

    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;
    const payload = {
      resourceId: "resource-1",
      isPublished: true,
    };

    const result = await options.mutationFn(payload);
    await options.onSuccess?.(result, payload);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminResourcesQueryKeys.all,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["resource-categories"] });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["resources"] });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["resource-detail"] });
  });
});
