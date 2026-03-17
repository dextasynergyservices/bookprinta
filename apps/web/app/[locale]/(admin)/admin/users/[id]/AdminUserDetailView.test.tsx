import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminUserDetailView } from "./AdminUserDetailView";

const useAdminUserDetailMock = jest.fn();
const useAdminUpdateUserMutationMock = jest.fn();
const useAdminDeleteUserMutationMock = jest.fn();
const useAdminReactivateUserMutationMock = jest.fn();
const routerReplaceMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  role_user: "USER",
  role_admin: "ADMIN",
  role_editor: "EDITOR",
  role_manager: "MANAGER",
  role_super_admin: "SUPER ADMIN",
  books_title_untitled: "Untitled book",
  books_table_order_ref: "Order Ref",
  users_table_email: "Email",
  users_table_joined: "Joined",
  users_joined_unavailable: "Join date unavailable",
  users_back_to_list: "Back to Users",
  users_status_verified: "Verified",
  users_status_unverified: "Unverified",
  users_status_active: "Active",
  users_status_inactive: "Inactive",
  users_detail_description:
    "Inspect account history, adjust permissions, and review every related order, manuscript, and payment from one admin workspace.",
  users_detail_error_title: "Unable to load admin user details",
  users_detail_error_description:
    "We couldn't load this user workspace right now. Please try again.",
  users_detail_refetch: "Reload User",
  users_detail_updated: "Last Updated",
  users_detail_unknown: "Unavailable",
  users_detail_section_management_eyebrow: "Controls",
  users_detail_section_management: "Account Controls",
  users_detail_section_management_description:
    "Update access level, verification state, or deactivate this account without leaving the user workspace.",
  users_detail_section_profile_eyebrow: "Profile",
  users_detail_section_profile: "Profile Summary",
  users_detail_section_profile_description:
    "The latest personal details, links, and communication preferences for this customer.",
  users_detail_section_orders_eyebrow: "Orders",
  users_detail_section_orders: "Order History",
  users_detail_section_orders_description:
    "Every order linked to this account, with direct links back into the order workspace.",
  users_detail_section_books_eyebrow: "Books",
  users_detail_section_books: "Book History",
  users_detail_section_books_description:
    "All books connected to the user, including production and manuscript status context.",
  users_detail_section_payments_eyebrow: "Payments",
  users_detail_section_payments: "Payment History",
  users_detail_section_payments_description:
    "Payment records tied to the user, with provider references and receipt access where available.",
  users_detail_metric_orders: "Orders",
  users_detail_metric_books: "Books",
  users_detail_metric_payments: "Payments",
  users_detail_metric_profile: "Profile Health",
  users_detail_metric_profile_complete: "Complete",
  users_detail_metric_profile_incomplete: "Needs Attention",
  users_detail_metric_profile_hint:
    "Signals whether the author profile has enough information for a polished public presence.",
  users_detail_first_name: "First Name",
  users_detail_last_name: "Last Name",
  users_detail_phone: "Phone",
  users_detail_preferred_language: "Preferred Language",
  users_detail_whatsapp: "WhatsApp",
  users_detail_website: "Website",
  users_detail_bio: "Bio",
  users_detail_no_bio: "This user has not added a profile bio yet.",
  users_detail_purchase_links: "Purchase Links",
  users_detail_social_links: "Social Links",
  users_detail_no_purchase_links: "No purchase links have been added yet.",
  users_detail_no_social_links: "No social links have been added yet.",
  users_detail_notification_preferences: "Notification Preferences",
  users_detail_notification_email: "Email Notifications",
  users_detail_notification_whatsapp: "WhatsApp Notifications",
  users_detail_notification_in_app: "In-App Notifications",
  users_detail_enabled: "Enabled",
  users_detail_disabled: "Disabled",
  users_detail_role_label: "Role",
  users_detail_verified_label: "Verified Account",
  users_detail_verified_description:
    "Control whether this user is treated as verified throughout authentication and admin workflows.",
  users_detail_deactivate_label: "Deactivate Account",
  users_detail_deactivate_description:
    "Deactivate this user to block future login, checkout linkage, and refresh token use while preserving their history.",
  users_detail_deactivate_locked:
    "This account is already inactive. Use the reactivate action below to restore access.",
  users_action_reactivate: "Reactivate User",
  users_action_reactivating: "Reactivating user",
  users_action_reactivate_success: "User reactivated",
  users_detail_reactivate_success: "User reactivated",
  users_detail_reactivate_error_title: "Unable to reactivate user",
  users_detail_reactivate_error_description:
    "Refresh the user details and try the reactivation again.",
  users_detail_management_hint:
    "Changes are saved to the audit log and reflected across the admin user directory after the mutation completes.",
  users_detail_save: "Save Changes",
  users_detail_saving: "Saving changes",
  users_detail_save_success: "User updated",
  users_detail_save_success_description: "{action} was recorded at {date}.",
  users_detail_save_error_title: "Unable to update user",
  users_detail_save_error_description: "Refresh the user details and try that change again.",
  users_detail_latest_audit: "Latest Audit Entry",
  users_detail_deactivate_dialog_title: "Deactivate This Account",
  users_detail_deactivate_dialog_description:
    "This immediately blocks future login and refresh-token use for this account while preserving all historical orders, books, and payments.",
  users_detail_deactivate_cancel: "Cancel",
  users_detail_deactivate_confirm: "Deactivate User",
  users_detail_deactivating: "Deactivating user",
  users_detail_deactivate_success: "User deactivated",
  users_detail_deactivate_error_title: "Unable to deactivate user",
  users_detail_deactivate_error_description:
    "Refresh the user details and try the deactivation again.",
  users_detail_delete: "Delete User",
  users_detail_deleting: "Deleting user",
  users_detail_delete_success: "User deleted",
  users_detail_delete_success_description: "The user was deleted and removed from active access.",
  users_detail_delete_error_title: "Unable to delete user",
  users_detail_delete_error_description: "Refresh the user details and try deleting again.",
  users_detail_delete_dialog_title: "Delete This User",
  users_detail_delete_dialog_description:
    "This permanently deactivates the account for login and checkout linking while preserving historical records.",
  users_detail_delete_cancel: "Cancel",
  users_detail_delete_confirm: "Delete User Permanently",
  users_detail_order_package: "Package",
  users_detail_order_total: "Order Total",
  users_detail_order_created: "Created",
  users_detail_no_orders: "This user has no orders yet.",
  users_detail_book_created: "Created",
  users_detail_book_updated: "Last Updated",
  users_detail_no_books: "This user has no books yet.",
  users_detail_payment_order: "Order Reference",
  users_detail_payment_provider_ref: "Provider Reference",
  users_detail_payment_created: "Created",
  users_detail_payment_approved: "Approved",
  users_detail_no_payments: "This user has no payments yet.",
  users_detail_open_order: "Open Order",
  users_detail_open_book: "Open Book",
  users_detail_open_receipt: "Open Receipt",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations: (_namespace?: string) => (key: string, values?: Record<string, unknown>) =>
    interpolate(translations[key] ?? key, values),
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-admin-users-filters", () => ({
  ADMIN_USER_ROLE_OPTIONS: ["USER", "EDITOR", "MANAGER", "ADMIN", "SUPER_ADMIN"],
}));

jest.mock("@/hooks/useAdminUserDetail", () => ({
  useAdminUserDetail: (input: unknown) => useAdminUserDetailMock(input),
}));

jest.mock("@/hooks/useAdminUserActions", () => ({
  useAdminUpdateUserMutation: () => useAdminUpdateUserMutationMock(),
  useAdminDeleteUserMutation: () => useAdminDeleteUserMutationMock(),
  useAdminReactivateUserMutation: () => useAdminReactivateUserMutationMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function createUserDetail() {
  return {
    profile: {
      id: "cm1111111111111111111111111",
      firstName: "Ada",
      lastName: "Okafor",
      fullName: "Ada Okafor",
      email: "ada@example.com",
      phoneNumber: "+2348000000000",
      role: "EDITOR" as const,
      isVerified: true,
      isActive: true,
      preferredLanguage: "en" as const,
      bio: "Author of literary fiction and essays.",
      profileImageUrl: null,
      whatsAppNumber: "+2348000000000",
      websiteUrl: "https://ada.example.com",
      purchaseLinks: [
        {
          label: "Storefront",
          url: "https://store.example.com/ada",
        },
      ],
      socialLinks: [
        {
          platform: "Instagram",
          url: "https://instagram.com/ada",
        },
      ],
      isProfileComplete: true,
      notificationPreferences: {
        email: true,
        whatsApp: false,
        inApp: true,
      },
      createdAt: "2026-03-10T09:30:00.000Z",
      updatedAt: "2026-03-12T14:45:00.000Z",
    },
    orders: [
      {
        id: "ord_1",
        orderNumber: "BP-2026-0001",
        orderType: "PRINT" as const,
        orderStatus: "PAID" as const,
        bookStatus: "FORMATTING" as const,
        package: {
          id: "pkg_1",
          name: "Premium",
          slug: "premium",
        },
        totalAmount: 85000,
        currency: "NGN",
        createdAt: "2026-03-10T10:00:00.000Z",
        detailUrl: "/admin/orders/ord_1",
      },
    ],
    books: [
      {
        id: "book_1",
        title: "The Lagos Chronicle",
        status: "FORMATTING" as const,
        productionStatus: "FORMATTING_REVIEW" as const,
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        createdAt: "2026-03-10T11:00:00.000Z",
        updatedAt: "2026-03-12T08:30:00.000Z",
        detailUrl: "/admin/books/book_1",
        orderDetailUrl: "/admin/orders/ord_1",
      },
    ],
    payments: [
      {
        id: "pay_1",
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        provider: "PAYSTACK" as const,
        type: "FULL_PAYMENT" as const,
        status: "SUCCESS" as const,
        amount: 85000,
        currency: "NGN",
        providerRef: "PSK-001",
        receiptUrl: "https://example.com/receipt.pdf",
        approvedAt: "2026-03-10T10:10:00.000Z",
        processedAt: "2026-03-10T10:08:00.000Z",
        createdAt: "2026-03-10T10:05:00.000Z",
        updatedAt: "2026-03-10T10:10:00.000Z",
        orderDetailUrl: "/admin/orders/ord_1",
      },
    ],
  };
}

function createDetailQueryState(overrides?: Record<string, unknown>) {
  const user = createUserDetail();

  return {
    data: user,
    user,
    error: null,
    isError: false,
    isInitialLoading: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

function createMutationState(overrides?: Record<string, unknown>) {
  return {
    mutateAsync: jest.fn(),
    isPending: false,
    ...overrides,
  };
}

describe("AdminUserDetailView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAdminUserDetailMock.mockReturnValue(createDetailQueryState());
    useAdminUpdateUserMutationMock.mockReturnValue(createMutationState());
    useAdminDeleteUserMutationMock.mockReturnValue(createMutationState());
    useAdminReactivateUserMutationMock.mockReturnValue(createMutationState());
  });

  it("renders the skeleton layout while the detail query is loading", () => {
    useAdminUserDetailMock.mockReturnValue(
      createDetailQueryState({
        data: null,
        user: null,
        isInitialLoading: true,
      })
    );

    const { container } = render(<AdminUserDetailView userId="cm1111111111111111111111111" />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders profile information with orders, books, and payments history", () => {
    render(<AdminUserDetailView userId="cm1111111111111111111111111" />);

    expect(screen.getByRole("heading", { name: "Ada Okafor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account Controls" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profile Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order History" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Book History" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payment History" })).toBeInTheDocument();
    expect(screen.getAllByText("The Lagos Chronicle").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Open Order/ })[0]).toHaveAttribute(
      "href",
      "/admin/orders/ord_1"
    );
    expect(screen.getByRole("link", { name: /Open Book/ })).toHaveAttribute(
      "href",
      "/admin/books/book_1"
    );
    expect(screen.getByRole("link", { name: "Storefront" })).toHaveAttribute(
      "href",
      "https://store.example.com/ada"
    );
  });

  it("submits role and verification changes through the update mutation", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({
      audit: {
        action: "ADMIN_USER_ROLE_UPDATED",
        recordedAt: "2026-03-14T12:00:00.000Z",
      },
    });

    useAdminUpdateUserMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminUserDetailView userId="cm1111111111111111111111111" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Role" }), "ADMIN");
    await user.click(screen.getByRole("switch", { name: "Verified Account" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        userId: "cm1111111111111111111111111",
        input: {
          role: "ADMIN",
          isVerified: false,
        },
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "User updated",
      expect.objectContaining({
        description: expect.any(String),
      })
    );
  });

  it("opens the deactivate dialog and deactivates the account after confirmation", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({
      audit: {
        action: "ADMIN_USER_DEACTIVATED",
        recordedAt: "2026-03-14T12:05:00.000Z",
      },
    });

    useAdminUpdateUserMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminUserDetailView userId="cm1111111111111111111111111" />);

    await user.click(screen.getByRole("switch", { name: "Deactivate Account" }));
    expect(screen.getByText("Deactivate This Account")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate User" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        userId: "cm1111111111111111111111111",
        input: {
          isActive: false,
        },
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "User deactivated",
      expect.objectContaining({
        description: expect.any(String),
      })
    );
  });

  it("opens the delete dialog, deletes the user, and redirects to users list", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({
      audit: {
        action: "ADMIN_USER_DELETED",
        recordedAt: "2026-03-14T12:10:00.000Z",
      },
    });

    useAdminDeleteUserMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminUserDetailView userId="cm1111111111111111111111111" />);

    await user.click(screen.getByRole("button", { name: "Delete User" }));
    expect(screen.getByText("Delete This User")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete User Permanently" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        userId: "cm1111111111111111111111111",
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "User deleted",
      expect.objectContaining({
        description: "The user was deleted and removed from active access.",
      })
    );
    expect(routerReplaceMock).toHaveBeenCalledWith("/admin/users");
  });

  it("reactivates an inactive account from the detail controls", async () => {
    const user = userEvent.setup();
    const inactiveDetail = createUserDetail();
    inactiveDetail.profile.isActive = false;

    const mutateAsync = jest.fn().mockResolvedValue({
      audit: {
        action: "ADMIN_USER_REACTIVATED",
        recordedAt: "2026-03-17T12:10:00.000Z",
      },
    });

    useAdminUserDetailMock.mockReturnValue(
      createDetailQueryState({
        data: inactiveDetail,
        user: inactiveDetail,
      })
    );
    useAdminReactivateUserMutationMock.mockReturnValue(
      createMutationState({
        mutateAsync,
      })
    );

    render(<AdminUserDetailView userId="cm1111111111111111111111111" />);

    await user.click(screen.getByRole("button", { name: "Reactivate User" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        userId: "cm1111111111111111111111111",
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "User reactivated",
      expect.objectContaining({
        description: expect.any(String),
      })
    );
  });
});
