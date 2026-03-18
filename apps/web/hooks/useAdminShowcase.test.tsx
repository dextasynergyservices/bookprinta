import { renderHook } from "@testing-library/react";
import {
  adminShowcaseQueryKeys,
  useCreateAdminShowcaseEntryMutation,
  useDeleteAdminShowcaseEntryMutation,
  useUpdateAdminShowcaseEntryMutation,
} from "./useAdminShowcase";

const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();

jest.mock("@/lib/api/admin-showcase", () => ({
  createAdminShowcaseCategory: jest.fn(),
  createAdminShowcaseEntry: jest.fn().mockResolvedValue({ id: "cm_entry_1" }),
  deleteAdminShowcaseCategory: jest.fn(),
  deleteAdminShowcaseEntry: jest.fn().mockResolvedValue({ id: "cm_entry_1", deleted: true }),
  fetchAdminShowcaseCategories: jest.fn(),
  fetchAdminShowcaseEntries: jest.fn(),
  searchAdminShowcaseUsers: jest.fn(),
  updateAdminShowcaseCategory: jest.fn(),
  updateAdminShowcaseEntry: jest
    .fn()
    .mockResolvedValue({ id: "cm_entry_1", authorName: "Updated" }),
  uploadAdminShowcaseCover: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: jest.fn(),
  useMutation: (options: unknown) => {
    useMutationMock(options);
    return options;
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

type MutationOptionsShape = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess?: (_data: unknown, _variables: unknown) => Promise<void>;
};

describe("useAdminShowcase mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it("invalidates showcase caches after creating entry", async () => {
    renderHook(() => useCreateAdminShowcaseEntryMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const response = await options.mutationFn({
      authorName: "A. Author",
      bookTitle: "Stories",
      coverImageUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
    });

    await options.onSuccess?.(response, {
      authorName: "A. Author",
      bookTitle: "Stories",
      coverImageUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: adminShowcaseQueryKeys.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminShowcaseQueryKeys.categories,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminShowcaseQueryKeys.entries,
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["showcase"] });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["showcase-categories"] });
  });

  it("invalidates caches after updating and deleting entry", async () => {
    renderHook(() => useUpdateAdminShowcaseEntryMutation());
    const updateOptions = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const updated = await updateOptions.mutationFn({
      entryId: "cm_entry_1",
      input: { authorName: "Updated" },
    });
    await updateOptions.onSuccess?.(updated, {
      entryId: "cm_entry_1",
      input: { authorName: "Updated" },
    });

    renderHook(() => useDeleteAdminShowcaseEntryMutation());
    const deleteOptions = useMutationMock.mock.calls[1]?.[0] as MutationOptionsShape;

    const deleted = await deleteOptions.mutationFn("cm_entry_1");
    await deleteOptions.onSuccess?.(deleted, "cm_entry_1");

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: adminShowcaseQueryKeys.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminShowcaseQueryKeys.entries,
    });
  });
});
