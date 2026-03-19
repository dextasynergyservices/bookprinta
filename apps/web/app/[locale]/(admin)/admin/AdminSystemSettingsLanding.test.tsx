/**
 * AdminSystemSettingsLanding unit tests.
 *
 * All mocks use jest.mock() with fully self-contained factories so that
 * hoisting by Babel/Jest does not cause undefined variable references.
 * Mutable mock handles are captured as module-level jest.fn() variables
 * because jest.fn() calls ARE available when hoisted factories run.
 *
 * The hook mocks return *object-level stable references* for arrays/objects
 * (defined once at factory creation time) so that React useEffect dependency
 * comparisons do not change on every render — which would cause an infinite
 * re-render / "Maximum update depth exceeded" error with Radix compose-refs.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------- mutable mock handles (jest.fn is available after hoisting) -----
const mutateSettingMock = jest.fn();
const mutateGatewayMock = jest.fn();
const mutateDelayOverrideMock = jest.fn();
const updateSectionDraftMock = jest.fn();
const initializeSectionMock = jest.fn();
const markSectionSavedMock = jest.fn();
const resetSectionMock = jest.fn();
const clearSectionMock = jest.fn();
const isSectionDirtyMock = jest.fn().mockReturnValue(false);

const dirtyStateMock = {
  get hasUnsavedChanges() {
    return _unsaved;
  },
  initializeSection: initializeSectionMock,
  updateSectionDraft: updateSectionDraftMock,
  markSectionSaved: markSectionSavedMock,
  resetSection: resetSectionMock,
  clearSection: clearSectionMock,
  isSectionDirty: isSectionDirtyMock,
};

let _unsaved = false;

// ---------- module mocks ---------------------------------------------------

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// Heavy Radix primitives: mock them all with plain HTML so the Radix
// compose-refs ref-callback-setState loop never occurs in jsdom.
jest.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? ("true" as const) : ("false" as const)}
      aria-disabled={disabled ? ("true" as const) : ("false" as const)}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onCheckedChange?.(!checked);
        }
      }}
    />
  ),
}));

jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}));

jest.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange: _onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => <div data-testid="select-root">{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-trigger">{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    "aria-label": ariaLabel,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    "aria-label"?: string;
  }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

jest.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ user: { id: "cm-super-admin", role: "SUPER_ADMIN" } }),
}));

// Stable data defined inside the factory (NOT outer scope) so that:
//  1. No hoisting issues — factory is self-contained.
//  2. References are identity-stable across renders.
jest.mock("@/hooks/useAdminSettings", () => {
  const SETTINGS = [
    {
      key: "maintenance_mode",
      value: false,
      description: "Maintenance mode",
      category: "operational",
      valueType: "boolean",
      isSensitive: false,
      requiresSuperAdmin: true,
    },
    {
      key: "production_backlog_threshold",
      value: 20,
      description: "Backlog threshold",
      category: "operational",
      valueType: "integer",
      isSensitive: false,
      requiresSuperAdmin: false,
    },
    {
      key: "reprint_minimum_copies",
      value: 25,
      description: "Reprint minimum copies",
      category: "quote_pricing",
      valueType: "integer",
      isSensitive: false,
      requiresSuperAdmin: true,
    },
    {
      key: "comms_sender_name",
      value: "BookPrinta",
      description: "Sender name",
      category: "notification_comms",
      valueType: "string",
      isSensitive: false,
      requiresSuperAdmin: false,
    },
  ];

  const GATEWAYS = [
    {
      id: "cmgateway-paystack",
      provider: "PAYSTACK",
      name: "Paystack",
      isEnabled: true,
      isTestMode: true,
      priority: 1,
      instructions: "",
      credentials: [
        {
          field: "publicKey",
          label: "Public Key",
          maskedValue: "pk_test_***abc",
          isConfigured: true,
        },
      ],
    },
  ];

  const PRODUCTION_STATUS = { manualOverrideState: "auto", backlogCount: 7, affectedUserCount: 3 };

  return {
    normalizeAdminSettingsError: (error: unknown) => ({
      title: "Save failed",
      description: error instanceof Error ? error.message : "Error",
      fieldErrors: {},
    }),
    // Returns the SAME object references every call — critical for stable deps.
    useAdminSystemSettings: () => ({ settings: SETTINGS, isInitialLoading: false }),
    useAdminSystemPaymentGateways: () => ({ gateways: GATEWAYS, isInitialLoading: false }),
    useAdminProductionStatus: () => ({ status: PRODUCTION_STATUS, isInitialLoading: false }),
    useUpdateAdminSystemSettingMutation: () => ({
      mutateAsync: mutateSettingMock,
      isPending: false,
    }),
    useUpdateAdminSystemPaymentGatewayMutation: () => ({
      mutateAsync: mutateGatewayMock,
      isPending: false,
    }),
    useUpdateAdminProductionDelayOverrideMutation: () => ({
      mutateAsync: mutateDelayOverrideMock,
      isPending: false,
    }),
    useAdminSettingsUnsavedChanges: () => dirtyStateMock,
  };
});

// Load component AFTER all mocks are registered.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AdminSystemSettingsLanding } = require("./AdminSystemSettingsLanding");

// ---------- tests -----------------------------------------------------------

describe("AdminSystemSettingsLanding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _unsaved = false;
    isSectionDirtyMock.mockReturnValue(false);
  });

  it("toggles maintenance switch using keyboard interaction", async () => {
    const user = userEvent.setup();
    render(<AdminSystemSettingsLanding />);

    const operationalHeader = screen.getByText("system_settings_section_operational");
    const operationalCard = operationalHeader.closest("article");
    expect(operationalCard).not.toBeNull();

    // The label and switch are siblings inside a shared row. Walk up to the
    // flex-row container that holds both the label div and the switch.
    const maintenanceLabel = within(operationalCard as HTMLElement).getByText(
      "system_settings_maintenance_mode"
    );
    // Go up past the text div to a parent that also contains the switch.
    const rowContainer = maintenanceLabel.closest("div")?.parentElement;
    expect(rowContainer).not.toBeNull();

    const maintenanceSwitch = within(rowContainer as HTMLElement).getByRole("switch");
    expect(maintenanceSwitch).toHaveAttribute("aria-checked", "false");

    maintenanceSwitch.focus();
    await user.keyboard("[Space]");

    expect(maintenanceSwitch).toHaveAttribute("aria-checked", "true");
    expect(updateSectionDraftMock).toHaveBeenCalled();
  });

  it("toggles gateway mode switch and updates mode label", async () => {
    const user = userEvent.setup();
    render(<AdminSystemSettingsLanding />);

    // Verify the gateway is rendered at all
    expect(screen.getByText("Paystack")).toBeInTheDocument();

    // The mode label is a <span> inside its own grid cell alongside the Switch.
    // Use screen-level query to find the label, then scope into its grid cell.
    const modeLabel = screen.getByText("system_settings_mode");
    // The grid cell contains: the label <span> + a flex row with the Switch + mode text
    const modeCell = modeLabel.closest("div");
    expect(modeCell).not.toBeNull();

    const modeSwitch = within(modeCell as HTMLElement).getByRole("switch");
    expect(screen.getByText("system_settings_test_mode")).toBeInTheDocument();

    await user.click(modeSwitch);

    expect(screen.getByText("system_settings_live_mode")).toBeInTheDocument();
    expect(updateSectionDraftMock).toHaveBeenCalled();
  });

  it("shows masked credential input as password and toggles to text", async () => {
    const user = userEvent.setup();
    render(<AdminSystemSettingsLanding />);

    const toggleButton = screen.getByRole("button", {
      name: "system_settings_show_secret",
    });

    const replacementInput = screen.getByPlaceholderText(
      "system_settings_secret_replace_placeholder"
    );
    expect(replacementInput).toHaveAttribute("type", "password");

    await user.click(toggleButton);

    expect(screen.getByRole("button", { name: "system_settings_hide_secret" })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("system_settings_secret_replace_placeholder")
    ).toHaveAttribute("type", "text");
  });
});
