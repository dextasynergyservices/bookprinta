import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminCouponsView } from "./AdminCouponsView";

const useAdminCouponsMock = jest.fn();
const useCreateAdminCouponMutationMock = jest.fn();
const useUpdateAdminCouponMutationMock = jest.fn();
const useToggleAdminCouponActiveMutationMock = jest.fn();
const useDeleteAdminCouponMutationMock = jest.fn();

const createMutateAsyncMock = jest.fn();
const updateMutateAsyncMock = jest.fn();
const toggleMutateAsyncMock = jest.fn();
const deleteMutateAsyncMock = jest.fn();

const translations: Record<string, string> = {
  panel_label: "BookPrinta Admin",
  coupons: "Coupons",
  coupons_workspace_description: "Create and manage discount coupons",
  coupons_create_title: "Create Coupon",
  coupons_list_title: "Coupons",
  coupons_form_code: "Code",
  coupons_form_type: "Type",
  coupons_form_value: "Discount Value",
  coupons_form_active: "Active",
  coupons_form_max_uses: "Usage Limit",
  coupons_form_set_max_uses: "Set max uses",
  coupons_form_expiry: "Expiry",
  coupons_form_set_expiry: "Set expiry date",
  coupons_form_validation_summary: "Please correct the highlighted fields and try again.",
  coupons_type_percentage: "Percentage",
  coupons_type_fixed: "Fixed",
  coupons_table_code: "Code",
  coupons_table_type: "Type",
  coupons_table_value: "Value",
  coupons_table_usage: "Uses",
  coupons_table_expiry: "Expiry",
  coupons_table_status: "Status",
  coupons_table_actions: "Actions",
  coupons_actions_for_code: "Actions for coupon {code}",
  coupons_usage_unlimited: "{current} / Unlimited",
  coupons_usage_limited: "{current} / {max}",
  coupons_usage_state_unlimited: "Unlimited usage",
  coupons_usage_state_healthy: "Healthy usage",
  coupons_usage_state_near_limit: "Near usage limit",
  coupons_usage_state_limit_reached: "Usage limit reached",
  coupons_expiry_none: "No expiry",
  coupons_status_active: "Active",
  coupons_status_inactive: "Inactive",
  coupons_status_expired: "Expired",
  coupons_action_create: "Create Coupon",
  coupons_action_creating: "Creating...",
  coupons_action_reset: "Reset",
  coupons_action_edit: "Edit",
  coupons_action_activate: "Activate",
  coupons_action_deactivate: "Deactivate",
  coupons_action_delete: "Delete",
  coupons_action_cancel: "Cancel",
  coupons_action_save: "Save Changes",
  coupons_action_saving: "Saving...",
  coupons_action_confirm_delete: "Delete Coupon",
  coupons_action_deleting: "Deleting...",
  coupons_edit_title: "Edit Coupon",
  coupons_edit_description: "Update coupon details and save your changes.",
  coupons_delete_title: "Delete Coupon",
  coupons_delete_description: "Delete coupon {code}? This action cannot be undone.",
  coupons_empty: "No coupons yet. Create your first coupon to get started.",
  coupons_retry: "Retry",
  coupons_error_title: "Unable to load coupons",
  coupons_error_description:
    "The coupons workspace could not be loaded right now. Retry to pull fresh data.",
  coupons_toast_created: "Coupon created successfully.",
  coupons_toast_updated: "Coupon updated successfully.",
  coupons_toast_activated: "Coupon activated successfully.",
  coupons_toast_deactivated: "Coupon deactivated successfully.",
  coupons_toast_deleted: "Coupon deleted successfully.",
  coupons_toast_create_failed: "Unable to create coupon",
  coupons_toast_update_failed: "Unable to update coupon",
  coupons_toast_delete_failed: "Unable to delete coupon",
  coupons_validation_code_required: "Coupon code is required.",
  coupons_validation_code_pattern:
    "Code can only include letters, numbers, hyphen, and underscore.",
  coupons_validation_discount_value_required: "Discount value must be greater than zero.",
  coupons_validation_discount_percentage_max: "Percentage discount cannot exceed 100.",
  coupons_validation_max_uses_required: "Max uses must be at least 1.",
  coupons_validation_expires_at_invalid: "Enter a valid expiry date and time.",
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

jest.mock("@/hooks/useAdminCoupons", () => ({
  useAdminCoupons: () => useAdminCouponsMock(),
  useCreateAdminCouponMutation: () => useCreateAdminCouponMutationMock(),
  useUpdateAdminCouponMutation: () => useUpdateAdminCouponMutationMock(),
  useToggleAdminCouponActiveMutation: () => useToggleAdminCouponActiveMutationMock(),
  useDeleteAdminCouponMutation: () => useDeleteAdminCouponMutationMock(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function createMutationState(mutateAsync: jest.Mock) {
  return {
    mutateAsync,
    isPending: false,
  };
}

function createCoupon(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    code: `CODE-${id}`,
    discountType: "percentage",
    discountValue: 10,
    maxUses: 10,
    currentUses: 2,
    expiresAt: null,
    isActive: true,
    createdAt: "2026-03-10T09:30:00.000Z",
    updatedAt: "2026-03-10T09:30:00.000Z",
    ...overrides,
  };
}

function setupLoadedState() {
  const coupons = [
    createCoupon("expired", {
      code: "EXPIRED5",
      maxUses: 5,
      currentUses: 5,
      isActive: false,
      expiresAt: "2025-01-01T00:00:00.000Z",
    }),
    createCoupon("active", {
      code: "ACTIVEFREE",
      maxUses: null,
      currentUses: 2,
      isActive: true,
      expiresAt: null,
    }),
  ];

  useAdminCouponsMock.mockReturnValue({
    items: coupons,
    data: coupons,
    isInitialLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  });

  useCreateAdminCouponMutationMock.mockReturnValue(createMutationState(createMutateAsyncMock));
  useUpdateAdminCouponMutationMock.mockReturnValue(createMutationState(updateMutateAsyncMock));
  useToggleAdminCouponActiveMutationMock.mockReturnValue(
    createMutationState(toggleMutateAsyncMock)
  );
  useDeleteAdminCouponMutationMock.mockReturnValue(createMutationState(deleteMutateAsyncMock));

  return coupons;
}

function getCouponCardByCode(code: string) {
  const codeLabel = screen.getAllByText(code)[0];
  const card = codeLabel.closest("article");
  if (!card) {
    throw new Error(`Coupon card for ${code} was not found`);
  }
  return card;
}

describe("AdminCouponsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupLoadedState();
  });

  it("renders create form fields and coupon workspace headings", () => {
    render(<AdminCouponsView />);

    expect(screen.getByRole("heading", { name: "Create Coupon" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coupons", level: 1 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("SAVE20")).toBeInTheDocument();
    expect(screen.getByText("Discount Value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Coupon" })).toBeInTheDocument();
  });

  it("wires create, edit, deactivate, and delete actions to coupon mutations", async () => {
    const user = userEvent.setup();
    render(<AdminCouponsView />);

    await user.type(screen.getByPlaceholderText("SAVE20"), "newcoupon");

    const numberInputs = screen.getAllByRole("spinbutton");
    await user.clear(numberInputs[0]);
    await user.type(numberInputs[0], "25");

    await user.click(screen.getByRole("button", { name: "Create Coupon" }));

    expect(createMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "NEWCOUPON",
        discountType: "percentage",
        discountValue: 25,
        isActive: true,
      })
    );

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(updateMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        couponId: "expired",
      })
    );

    await user.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);

    expect(toggleMutateAsyncMock).toHaveBeenCalledWith({
      couponId: "active",
      isActive: false,
    });

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete Coupon" }));

    expect(deleteMutateAsyncMock).toHaveBeenCalledWith("expired");
  });

  it("renders usage indicators and explicit expired status treatment", () => {
    render(<AdminCouponsView />);

    const expiredCard = getCouponCardByCode("EXPIRED5");
    const activeCard = getCouponCardByCode("ACTIVEFREE");

    expect(within(expiredCard).getByText("5 / 5")).toBeInTheDocument();
    expect(within(expiredCard).getByText("Usage limit reached")).toBeInTheDocument();
    expect(within(expiredCard).getByText("Inactive")).toBeInTheDocument();
    expect(within(expiredCard).getByText("Expired")).toBeInTheDocument();
    expect(expiredCard.className).toContain("border-[#4A1D22]");
    expect(expiredCard.querySelector('[data-slot="progress"]')).not.toBeNull();

    expect(within(activeCard).getByText("2 / Unlimited")).toBeInTheDocument();
    expect(within(activeCard).getByText("Unlimited usage")).toBeInTheDocument();
    expect(within(activeCard).getByText("Active")).toBeInTheDocument();
    expect(activeCard.querySelector('[data-slot="progress"]')).not.toBeNull();
  });

  it("renders empty and error states clearly", async () => {
    useAdminCouponsMock.mockReturnValueOnce({
      items: [],
      data: [],
      isInitialLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<AdminCouponsView />);
    expect(
      screen.getByText("No coupons yet. Create your first coupon to get started.")
    ).toBeInTheDocument();

    const refetchMock = jest.fn();
    useAdminCouponsMock.mockReturnValueOnce({
      items: [],
      data: [],
      isInitialLoading: false,
      isError: true,
      error: new Error("Network unavailable"),
      refetch: refetchMock,
    });

    render(<AdminCouponsView />);

    expect(screen.getByText("Unable to load coupons")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchMock).toHaveBeenCalled();
  });
});
