import type { Address } from "@bookprinta/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSettingsAddressesPanel } from "./profile-settings-addresses-panel";

const useAddressesMock = jest.fn();
const createAddressMock = jest.fn();
const updateAddressMock = jest.fn();
const deleteAddressMock = jest.fn();
const toastSuccessMock = jest.fn();

let isCreatePending = false;
let isUpdatePending = false;
let isDeletePending = false;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

function installMatchMediaMock() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width") ? window.innerWidth < 768 : false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

const TRANSLATIONS: Record<string, string> = {
  addresses: "Addresses",
  addresses_intro_title: "Delivery addresses",
  addresses_intro_description:
    "Save delivery addresses for future shipments and account management.",
  addresses_syncing: "Refreshing saved addresses",
  addresses_add: "Add Address",
  addresses_add_first: "Add your first address",
  addresses_default_badge: "Default",
  addresses_edit: "Edit",
  addresses_delete: "Delete",
  addresses_edit_aria: "Edit address",
  addresses_delete_aria: "Delete address",
  addresses_load_error_title: "Unable to load your addresses",
  addresses_load_error_description:
    "We couldn't load your saved addresses right now. Please try again.",
  addresses_retry: "Retry",
  retry: "Try Again",
  addresses_empty_title: "No saved addresses yet",
  addresses_empty_description:
    "Add a delivery address now so you are ready when shipping becomes available.",
  addresses_form_close: "Close address form",
  addresses_form_add_title: "Add address",
  addresses_form_edit_title: "Edit address",
  addresses_form_add_description: "Save a new shipping address to your account.",
  addresses_form_edit_description: "Update the saved delivery details for this address.",
  addresses_form_cancel: "Cancel",
  addresses_form_add_submit: "Save Address",
  addresses_form_update_submit: "Save Changes",
  addresses_form_saving: "Saving address...",
  addresses_field_full_name: "Full Name",
  addresses_field_phone: "Phone Number",
  addresses_field_street: "Street Address",
  addresses_field_city: "City",
  addresses_field_state: "State",
  addresses_field_country: "Country",
  addresses_field_postal_code: "Postal Code",
  addresses_placeholder_full_name: "Full name",
  addresses_placeholder_phone: "Phone number",
  addresses_placeholder_street: "Street address",
  addresses_placeholder_city: "City",
  addresses_placeholder_state: "State",
  addresses_placeholder_country: "Country",
  addresses_placeholder_postal_code: "Postal code",
  addresses_save_success: "Address saved.",
  addresses_update_success: "Address updated.",
  addresses_save_error: "Unable to save your address right now.",
  addresses_delete_title: "Delete this address?",
  addresses_delete_description: "This will remove the saved delivery details from your dashboard.",
  addresses_delete_close: "Close delete dialog",
  addresses_delete_cancel: "Cancel",
  addresses_delete_confirm: "Delete address",
  addresses_delete_confirming: "Deleting address...",
  addresses_delete_success: "Address deleted.",
  addresses_delete_error: "Unable to delete this address right now.",
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => TRANSLATIONS[key] ?? key,
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

jest.mock("framer-motion", () => {
  const React = require("react") as typeof import("react");
  const MOTION_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "whileHover",
    "whileTap",
    "whileInView",
    "viewport",
    "layout",
  ]);

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(function MotionPrimitive(
          { children, ...props }: React.HTMLAttributes<HTMLElement>,
          ref
        ) {
          const domProps = Object.fromEntries(
            Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key))
          );

          return React.createElement(tag, { ...domProps, ref }, children);
        }),
    }
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion,
  };
});

jest.mock("@/hooks/use-addresses", () => ({
  useAddresses: () => useAddressesMock(),
  useCreateAddress: () => ({
    createAddress: (...args: unknown[]) => createAddressMock(...args),
    isPending: isCreatePending,
  }),
  useUpdateAddress: () => ({
    updateAddress: (...args: unknown[]) => updateAddressMock(...args),
    isPending: isUpdatePending,
  }),
  useDeleteAddress: () => ({
    deleteAddress: (...args: unknown[]) => deleteAddressMock(...args),
    isPending: isDeletePending,
  }),
}));

const baseAddress: Address = {
  id: "cm98y5m4t0001psa2t7hj0q2n",
  fullName: "Ada Nwosu",
  phoneNumber: "+2348012345678",
  street: "15 Admiralty Way",
  city: "Lekki",
  state: "Lagos",
  country: "Nigeria",
  zipCode: "106104",
  isDefault: true,
  createdAt: "2026-03-13T10:00:00.000Z",
  updatedAt: "2026-03-13T10:00:00.000Z",
};

describe("ProfileSettingsAddressesPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setViewportWidth(375);
    installMatchMediaMock();
    isCreatePending = false;
    isUpdatePending = false;
    isDeletePending = false;
    useAddressesMock.mockReturnValue({
      addresses: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    createAddressMock.mockResolvedValue(baseAddress);
    updateAddressMock.mockResolvedValue(baseAddress);
    deleteAddressMock.mockResolvedValue({
      id: baseAddress.id,
      deleted: true,
    });
  });

  it("renders skeleton cards while addresses are loading", () => {
    useAddressesMock.mockReturnValue({
      addresses: [],
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    expect(screen.getByTestId("address-list-skeleton")).toBeInTheDocument();
  });

  it("shows the empty state and opens the add-address panel from the CTA", async () => {
    const user = userEvent.setup();

    render(<ProfileSettingsAddressesPanel />);

    expect(screen.getByText("No saved addresses yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add your first address" }));

    expect(screen.getByRole("heading", { name: "Add address" })).toBeInTheDocument();
    expect(screen.getByTestId("address-form-panel")).toBeInTheDocument();
  });

  it("shows a syncing status while refreshing an existing address list", () => {
    useAddressesMock.mockReturnValue({
      addresses: [baseAddress],
      isLoading: false,
      isFetching: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    expect(screen.getByText("Refreshing saved addresses")).toBeInTheDocument();
  });

  it("opens the add-address form from the header CTA", async () => {
    const user = userEvent.setup();

    render(<ProfileSettingsAddressesPanel />);

    await user.click(screen.getByRole("button", { name: "Add Address" }));

    const formPanel = await screen.findByTestId("address-form-panel");

    expect(within(formPanel).getByRole("heading", { name: "Add address" })).toBeInTheDocument();
    expect(within(formPanel).getByPlaceholderText("Full name")).toBeInTheDocument();
    expect(within(formPanel).getByPlaceholderText("Street address")).toBeInTheDocument();
  });

  it("uses the mobile sheet layout for the address form at 375px", async () => {
    const user = userEvent.setup();

    render(<ProfileSettingsAddressesPanel />);

    await user.click(screen.getByRole("button", { name: "Add Address" }));

    await waitFor(() =>
      expect(screen.getByTestId("address-form-shell")).toHaveAttribute(
        "data-motion-layout",
        "mobile-sheet"
      )
    );
  });

  it("uses the desktop slide-in panel layout for the address form at 1280px", async () => {
    const user = userEvent.setup();
    setViewportWidth(1280);

    render(<ProfileSettingsAddressesPanel />);

    await user.click(screen.getByRole("button", { name: "Add Address" }));

    await waitFor(() =>
      expect(screen.getByTestId("address-form-shell")).toHaveAttribute(
        "data-motion-layout",
        "desktop-panel"
      )
    );
  });

  it("uses the desktop slide-in panel layout from the 768px breakpoint upward", async () => {
    const user = userEvent.setup();
    setViewportWidth(768);

    render(<ProfileSettingsAddressesPanel />);

    await user.click(screen.getByRole("button", { name: "Add Address" }));

    await waitFor(() =>
      expect(screen.getByTestId("address-form-shell")).toHaveAttribute(
        "data-motion-layout",
        "desktop-panel"
      )
    );
  });

  it("renders the loaded address list with the saved card actions and default badge", () => {
    useAddressesMock.mockReturnValue({
      addresses: [baseAddress],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    expect(screen.getByText("Ada Nwosu")).toBeInTheDocument();
    expect(screen.getByText("+2348012345678")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit address" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete address" })).toBeInTheDocument();
  });

  it("prefills the edit form with the selected address", async () => {
    const user = userEvent.setup();

    useAddressesMock.mockReturnValue({
      addresses: [baseAddress],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    await user.click(screen.getByRole("button", { name: "Edit address" }));

    const formPanel = await screen.findByTestId("address-form-panel");

    expect(within(formPanel).getByRole("heading", { name: "Edit address" })).toBeInTheDocument();
    expect(within(formPanel).getByDisplayValue("Ada Nwosu")).toBeInTheDocument();
    expect(within(formPanel).getByDisplayValue("Lekki")).toBeInTheDocument();
    expect(within(formPanel).getByDisplayValue("Nigeria")).toBeInTheDocument();
  });

  it("requires delete confirmation before removing an address", async () => {
    const user = userEvent.setup();

    useAddressesMock.mockReturnValue({
      addresses: [baseAddress],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    await user.click(screen.getByRole("button", { name: "Delete address" }));

    expect(screen.getByText("Delete this address?")).toBeInTheDocument();

    await user.click(
      within(screen.getByTestId("delete-address-dialog")).getByRole("button", {
        name: "Delete address",
      })
    );

    await waitFor(() =>
      expect(deleteAddressMock).toHaveBeenCalledWith({
        addressId: baseAddress.id,
      })
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Address deleted.");
  });

  it("centers the delete confirmation dialog instead of anchoring it to the mobile bottom edge", async () => {
    const user = userEvent.setup();

    useAddressesMock.mockReturnValue({
      addresses: [baseAddress],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    await user.click(screen.getByRole("button", { name: "Delete address" }));

    expect(screen.getByTestId("delete-address-dialog-shell")).toHaveClass(
      "items-center",
      "justify-center"
    );
  });

  it("closes the add-address form on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();

    render(<ProfileSettingsAddressesPanel />);

    const addButton = screen.getByRole("button", { name: "Add Address" });
    await user.click(addButton);

    const closeButton = await screen.findByRole("button", { name: "Close address form" });
    expect(closeButton).toHaveFocus();
    expect(closeButton).toHaveClass("min-h-11", "min-w-11");

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Add address" })).not.toBeInTheDocument()
    );
    expect(addButton).toHaveFocus();
  });

  it("closes the delete confirmation on Escape and restores focus to the original action", async () => {
    const user = userEvent.setup();

    useAddressesMock.mockReturnValue({
      addresses: [baseAddress],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    const deleteButton = screen.getByRole("button", { name: "Delete address" });
    await user.click(deleteButton);

    const closeButton = await screen.findByRole("button", { name: "Close delete dialog" });
    expect(closeButton).toHaveFocus();
    expect(closeButton).toHaveClass("min-h-11", "min-w-11");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByText("Delete this address?")).not.toBeInTheDocument());
    expect(deleteButton).toHaveFocus();
  });

  it("keeps mobile-first full-width primary actions at a 375px viewport", () => {
    useAddressesMock.mockReturnValue({
      addresses: [baseAddress],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ProfileSettingsAddressesPanel />);

    expect(screen.getByRole("button", { name: "Add Address" })).toHaveClass("min-h-12", "w-full");
  });
});
