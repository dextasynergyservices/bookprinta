import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResendSignupLinkForm } from "./ResendSignupLinkForm";

const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();
let currentSearchParams = new URLSearchParams([["email", "user@example.com"]]);

jest.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

describe("ResendSignupLinkForm", () => {
  const fetchMock = jest.fn();

  function createMockResponse(
    status: number,
    body: Record<string, unknown>,
    headerMap: Record<string, string> = {}
  ) {
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headerMap).map(([key, value]) => [key.toLowerCase(), value])
    );

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) => normalizedHeaders[name.toLowerCase()] ?? null,
      },
      json: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams([["email", "user@example.com"]]);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("disables submit and shows countdown after 429 response", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      createMockResponse(
        429,
        { message: "Too many attempts", retryAfter: 120 },
        {
          "Content-Type": "application/json",
          "retry-after": "120",
        }
      )
    );

    try {
      render(<ResendSignupLinkForm />);

      const button = screen.getByRole("button", { name: "payment_confirmation_resend_button" });
      fireEvent.click(button);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByText("rate_limit_wait_seconds")).toBeInTheDocument();
      });

      expect(button).toBeDisabled();
      expect(toastErrorMock).toHaveBeenCalledWith("rate_limit_wait_minutes");
      expect(toastSuccessMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
