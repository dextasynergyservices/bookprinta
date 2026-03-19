import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminShowcaseWorkspaceView } from "./AdminShowcaseWorkspaceView";

const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

const useAdminShowcaseCategoriesMock = jest.fn();
const useAdminShowcaseEntriesMock = jest.fn();
const useAdminShowcaseUserSearchMock = jest.fn();
const useCreateAdminShowcaseCategoryMutationMock = jest.fn();
const useCreateAdminShowcaseEntryMutationMock = jest.fn();
const useUpdateAdminShowcaseEntryMutationMock = jest.fn();
const useDeleteAdminShowcaseEntryMutationMock = jest.fn();
const useToggleAdminShowcaseEntryFeaturedMutationMock = jest.fn();
const useAdminShowcaseCoverUploadMutationMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "Admin",
  showcase: "Showcase",
  showcase_workspace_description: "Manage showcase entries.",
  showcase_entries_title: "Showcase Entries",
  showcase_entries_description: "Create and maintain entries.",
  showcase_entries_loading: "Loading showcase entries...",
  showcase_entries_empty: "No showcase entries yet.",
  showcase_entries_replace_cover: "Replace Cover",
  showcase_entry_field_preview_path: "Preview URL",
  showcase_entry_field_featured: "Featured on homepage",
  showcase_entry_edit_title: "Edit Showcase Entry",
  showcase_entry_edit_modal_description:
    "Edit the selected showcase entry details without leaving this workspace.",
  showcase_entry_create_title: "Create Showcase Entry",
  showcase_entry_field_author_name: "Author Name",
  showcase_entry_field_title: "Book Title",
  showcase_entry_field_about_book: "About Book",
  showcase_entry_field_user: "Linked User",
  showcase_entry_field_category: "Category",
  showcase_entry_field_category_placeholder: "Select category",
  showcase_entry_field_published_year: "Published Year",
  showcase_entry_field_sort_order: "Sort Order",
  showcase_entry_field_cover_image: "Cover Image",
  showcase_cover_action_choose: "Choose Cover",
  showcase_cover_action_upload: "Upload Cover",
  showcase_cover_action_uploading: "Uploading cover...",
  showcase_cover_action_abort: "Cancel Upload",
  showcase_cover_progress_label: "Showcase cover upload progress",
  showcase_cover_status_uploading: "Uploading... {progress}%",
  showcase_cover_status_complete: "Cover uploaded successfully.",
  showcase_cover_validation_required: "Select a JPEG or PNG cover image before uploading.",
  showcase_cover_toast_uploaded: "Cover image uploaded successfully.",
  showcase_cover_toast_upload_failed: "Unable to upload the cover image.",
  showcase_cover_toast_replace_uploaded: "Cover image replaced successfully.",
  showcase_cover_toast_replace_failed: "Unable to replace the cover image.",
  showcase_entry_create_requires_cover: "Upload a cover image before creating the showcase entry.",
  showcase_entry_action_create: "Create Entry",
  showcase_entry_action_creating: "Creating...",
  showcase_entry_action_save: "Save Entry",
  showcase_entry_action_saving: "Saving...",
  showcase_entry_action_cancel: "Cancel",
  showcase_entry_action_delete: "Delete Entry",
  showcase_entry_delete_confirm_title: "Delete showcase entry?",
  showcase_entry_delete_confirm_description:
    'This will permanently delete "{title}" from the showcase.',
  showcase_entry_delete_confirm_cancel: "Cancel",
  showcase_entry_delete_confirm_confirm: "Delete",
  showcase_entries_page_size_label: "Page size",
  showcase_entries_action_first_page: "First",
  showcase_entry_toast_created: "Showcase entry created successfully.",
  showcase_entry_toast_updated: "Showcase entry updated successfully.",
  showcase_entry_toast_deleted: "Showcase entry deleted successfully.",
  showcase_entries_action_last_known_page: "Last Loaded",
  showcase_entry_toast_create_failed: "Unable to create showcase entry",
  showcase_entry_toast_update_failed: "Unable to update showcase entry",
  showcase_entry_toast_delete_failed: "Unable to delete showcase entry",
  showcase_user_search_placeholder: "Search users by name or email...",
  showcase_user_search_min_chars: "Type at least 2 characters to search users.",
  showcase_user_search_selected: "Linked user selected.",
  showcase_user_search_searching: "Searching users...",
  showcase_user_search_empty: "No matching users found.",
  showcase_entry_filters_search_label: "Search Entries",
  showcase_entry_filters_search_placeholder: "Search by book title or author...",
  showcase_entry_filters_featured_label: "Featured Filter",
  showcase_entry_filters_featured_all: "All Entries",
  showcase_entry_filters_featured_only: "Featured Only",
  showcase_entry_filters_regular_only: "Non-featured Only",
  packages_mobile_filter_all: "All",
};

function t(key: string, values?: Record<string, unknown>) {
  const template = translations[key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? ""));
}

jest.mock("next-intl", () => ({
  useTranslations: () => t,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src, ...props }: { alt: string; src: string; [key: string]: unknown }) => {
    const React = require("react") as typeof import("react");
    return React.createElement("img", { alt, src, ...props });
  },
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

jest.mock("@/hooks/useAdminShowcase", () => ({
  useAdminShowcaseCategories: () => useAdminShowcaseCategoriesMock(),
  useAdminShowcaseEntries: (...args: unknown[]) => useAdminShowcaseEntriesMock(...args),
  useAdminShowcaseUserSearch: (...args: unknown[]) => useAdminShowcaseUserSearchMock(...args),
  useCreateAdminShowcaseCategoryMutation: () => useCreateAdminShowcaseCategoryMutationMock(),
  useCreateAdminShowcaseEntryMutation: () => useCreateAdminShowcaseEntryMutationMock(),
  useUpdateAdminShowcaseEntryMutation: () => useUpdateAdminShowcaseEntryMutationMock(),
  useDeleteAdminShowcaseEntryMutation: () => useDeleteAdminShowcaseEntryMutationMock(),
  useToggleAdminShowcaseEntryFeaturedMutation: () =>
    useToggleAdminShowcaseEntryFeaturedMutationMock(),
  useAdminShowcaseCoverUploadMutation: () => useAdminShowcaseCoverUploadMutationMock(),
}));

function createDefaultHooks() {
  useAdminShowcaseCategoriesMock.mockReturnValue({
    categories: [{ id: "cat_1", name: "Fiction" }],
  });

  useAdminShowcaseEntriesMock.mockReturnValue({
    items: [
      {
        id: "entry_1",
        authorName: "Ada Author",
        bookTitle: "My Story",
        bookCoverUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
        aboutBook: "About",
        categoryId: "cat_1",
        category: { id: "cat_1", name: "Fiction" },
        publishedYear: 2025,
        userId: "user_1",
        user: { id: "user_1", displayName: "Ada User", email: "ada@example.com" },
        isFeatured: true,
        sortOrder: 1,
        previewPath: "/showcase?entry=entry_1",
      },
    ],
    isInitialLoading: false,
    isFetching: false,
  });

  useAdminShowcaseUserSearchMock.mockReturnValue({
    items: [{ id: "user_1", displayName: "Ada User", email: "ada@example.com" }],
    isFetching: false,
  });

  useCreateAdminShowcaseEntryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ id: "entry_2" }),
  });

  useCreateAdminShowcaseCategoryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ id: "cat_2", name: "Poetry" }),
  });

  useUpdateAdminShowcaseEntryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ id: "entry_1" }),
  });

  useDeleteAdminShowcaseEntryMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ id: "entry_1", deleted: true }),
  });

  useToggleAdminShowcaseEntryFeaturedMutationMock.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ id: "entry_1", isFeatured: false }),
  });

  useAdminShowcaseCoverUploadMutationMock.mockReturnValue({
    mutateAsync: jest
      .fn()
      .mockImplementation(async ({ onProgress }: { onProgress?: (v: number) => void }) => {
        onProgress?.(50);
        onProgress?.(100);
        return {
          action: "finalize",
          secureUrl: "https://res.cloudinary.com/demo/image/upload/new-cover.jpg",
          publicId: "new-cover",
        };
      }),
  });
}

describe("AdminShowcaseWorkspaceView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createDefaultHooks();
  });

  it("creates an entry after upload and supports edit/delete/featured toggle", async () => {
    const user = userEvent.setup();
    render(<AdminShowcaseWorkspaceView />);

    const file = new File([new Uint8Array([1, 2, 3])], "cover.jpg", { type: "image/jpeg" });
    const chooseInput = screen.getAllByLabelText("Choose Cover")[0] as HTMLInputElement;
    await user.upload(chooseInput, file);
    await user.click(screen.getByRole("button", { name: "Upload Cover" }));

    await waitFor(() => {
      expect(screen.getByText("Cover uploaded successfully.")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Author Name"), "New Author");
    await user.type(screen.getByLabelText("Book Title"), "New Book");

    await user.click(screen.getByRole("button", { name: "Create Entry" }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Showcase entry created successfully.");
    });

    await user.click(screen.getByRole("button", { name: "Edit Showcase Entry" }));
    const editDialog = await screen.findByRole("dialog");
    const authorInput = within(editDialog).getByLabelText("Author Name");
    await user.clear(authorInput);
    await user.type(authorInput, "Edited Author");
    await user.click(within(editDialog).getByRole("button", { name: "Save Entry" }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Showcase entry updated successfully.");
    });

    await user.click(screen.getByRole("button", { name: "Delete Entry" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Showcase entry deleted successfully.");
    });

    const featuredSwitch = screen.getAllByRole("switch", { name: "Featured on homepage" })[0];
    await user.click(featuredSwitch);

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Showcase entry updated successfully.");
    });
  });

  it("supports user search and exposes upload progress semantics", async () => {
    const user = userEvent.setup();
    render(<AdminShowcaseWorkspaceView />);

    await user.type(screen.getByLabelText("Linked User"), "Ada");

    expect(await screen.findByRole("button", { name: /Ada User/i })).toBeInTheDocument();

    const file = new File([new Uint8Array([1, 2, 3])], "cover.jpg", { type: "image/jpeg" });
    const chooseInput = screen.getAllByLabelText("Choose Cover")[0] as HTMLInputElement;
    await user.upload(chooseInput, file);
    await user.click(screen.getByRole("button", { name: "Upload Cover" }));

    expect(
      await screen.findByRole("progressbar", { name: "Showcase cover upload progress" })
    ).toBeInTheDocument();
  });
});
