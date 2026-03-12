import type { ReactNode } from "react";

jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(),
}));

jest.mock("@/components/admin/admin-auth-gate", () => ({
  AdminAuthGate: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("@/components/admin/admin-shell", () => ({
  AdminShell: ({ children }: { children: ReactNode }) => children,
}));

const { metadata } = require("./layout") as typeof import("./layout");

describe("AdminLayout metadata", () => {
  it("marks admin routes as noindex and nofollow", () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    });
  });
});
