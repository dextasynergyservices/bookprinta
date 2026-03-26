import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { OrdersView } from "./OrdersView";

type TranslationNamespace = "dashboard" | "common";

const TRANSLATIONS: Record<TranslationNamespace, Record<string, string>> = {
  dashboard: {
    orders: "Orders",
    orders_history_subtitle: "Track every order from payment to delivery.",
    orders_table_ref: "Order Ref",
    orders_table_package: "Package",
    orders_table_status: "Status",
    orders_table_date: "Date",
    orders_table_total: "Total Paid",
    orders_table_actions: "Actions",
    orders_action_track: "View Order Journey",
    orders_reprint_badge: "REPRINT",
    orders_unknown_package: "Package unavailable",
    orders_unknown_status: "Status unavailable",
    orders_unknown_date: "Date unavailable",
    orders_unknown_total: "Total unavailable",
    orders_error_title: "Unable to load orders",
    orders_error_description: "We couldn't load your order history right now. Please try again.",
    orders_empty_title: "No orders yet",
    orders_empty_description:
      "Your order history will appear here once you place your first order.",
    orders_empty_cta: "Explore Pricing",
    orders_pagination_aria: "Orders pagination",
    orders_pagination_previous: "Previous",
    orders_pagination_next: "Next",
    orders_pagination_page: "Page {page}",
    orders_pagination_page_of: "Page {page} of {totalPages}",
    orders_loading_more: "Loading more orders",
  },
  common: {
    loading: "Loading...",
    retry: "Try Again",
  },
};

const fetchMock = jest.fn();
const originalFetch = global.fetch;

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations:
    (namespace: TranslationNamespace) => (key: string, values?: Record<string, unknown>) => {
      const template = TRANSLATIONS[namespace]?.[key] ?? key;
      return interpolate(template, values);
    },
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
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

  return { motion };
});

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
}));

function createResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    headers: {
      get: jest.fn().mockReturnValue(null),
    },
  } as unknown as Response;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function buildOrdersResponse(options: {
  page: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  items: Array<{
    id: string;
    orderNumber: string;
    orderType: string;
    orderStatus: string;
    bookStatus: string | null;
    packageName: string;
    createdAt: string;
    totalAmount: number;
    currency?: string;
  }>;
}) {
  return {
    items: options.items.map((item) => ({
      id: item.id,
      orderNumber: item.orderNumber,
      orderType: item.orderType,
      status: item.orderStatus,
      book: item.bookStatus ? { status: item.bookStatus } : null,
      package: { name: item.packageName },
      createdAt: item.createdAt,
      totalAmount: item.totalAmount,
      currency: item.currency ?? "NGN",
    })),
    pagination: {
      page: options.page,
      pageSize: 10,
      totalItems: options.totalPages * 10,
      totalPages: options.totalPages,
      hasPreviousPage: options.hasPreviousPage,
      hasNextPage: options.hasNextPage,
      nextCursor: null,
    },
  };
}

function renderOrdersView() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  const utils = render(
    <QueryClientProvider client={client}>
      <OrdersView />
    </QueryClientProvider>
  );

  return {
    ...utils,
    client,
  };
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("Dashboard orders route integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders orders from mocked /api/v1/orders with status tone, reprint badge, actions, and responsive wrappers", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        buildOrdersResponse({
          page: 1,
          totalPages: 2,
          hasPreviousPage: false,
          hasNextPage: true,
          items: [
            {
              id: "ord_1",
              orderNumber: "BP-2026-0001",
              orderType: "REPRINT",
              orderStatus: "PAID",
              bookStatus: "DELIVERED",
              packageName: "Legacy",
              createdAt: "2026-03-01T10:00:00.000Z",
              totalAmount: 125000,
            },
          ],
        })
      )
    );

    const { container } = renderOrdersView();

    await screen.findAllByText("BP-2026-0001");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/orders?page=1&limit=10");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
    });

    expect(screen.getAllByText("REPRINT").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-tone="delivered"]')).toBeInTheDocument();

    const trackingLinks = screen.getAllByRole("link", { name: "View Order Journey" });
    expect(trackingLinks.length).toBeGreaterThan(0);
    expect(trackingLinks[0]).toHaveAttribute("href", "/dashboard/orders/ord_1");

    expect(container.querySelector("div.md\\:hidden")).toBeInTheDocument();
    expect(container.querySelector("div.hidden.md\\:block")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Orders pagination" })).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("preserves previous page state during pagination transition and supports keyboard pagination", async () => {
    const secondPageDeferred = createDeferred<Response>();
    fetchMock
      .mockResolvedValueOnce(
        createResponse(
          buildOrdersResponse({
            page: 1,
            totalPages: 2,
            hasPreviousPage: false,
            hasNextPage: true,
            items: [
              {
                id: "ord_1",
                orderNumber: "BP-2026-0001",
                orderType: "STANDARD",
                orderStatus: "PAID",
                bookStatus: "IN_PRODUCTION",
                packageName: "Legacy",
                createdAt: "2026-03-01T10:00:00.000Z",
                totalAmount: 125000,
              },
            ],
          })
        )
      )
      .mockImplementationOnce(() => secondPageDeferred.promise);

    const user = userEvent.setup();
    renderOrdersView();

    await screen.findAllByText("BP-2026-0001");
    const nextButton = screen.getByRole("button", { name: "Next" });
    nextButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByText("BP-2026-0001").length).toBeGreaterThan(0);

    secondPageDeferred.resolve(
      createResponse(
        buildOrdersResponse({
          page: 2,
          totalPages: 2,
          hasPreviousPage: true,
          hasNextPage: false,
          items: [
            {
              id: "ord_2",
              orderNumber: "BP-2026-0002",
              orderType: "STANDARD",
              orderStatus: "PAID",
              bookStatus: "PRINTING",
              packageName: "Glow Up",
              createdAt: "2026-03-02T12:00:00.000Z",
              totalAmount: 90000,
            },
          ],
        })
      )
    );

    await screen.findAllByText("BP-2026-0002");
    await waitFor(() => {
      expect(screen.queryAllByText("BP-2026-0001")).toHaveLength(0);
    });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("shows skeleton placeholders during initial fetch and then empty state with CTA when API returns no orders", async () => {
    const pendingRequest = createDeferred<Response>();
    fetchMock.mockImplementationOnce(() => pendingRequest.promise);

    const { container } = renderOrdersView();
    expect(
      container.querySelectorAll('[data-dashboard-skeleton="order-row"]').length
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);

    pendingRequest.resolve(
      createResponse({
        items: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
          nextCursor: null,
        },
      })
    );

    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    const pricingCta = screen.getByRole("link", { name: "Explore Pricing" });
    expect(pricingCta).toHaveAttribute("href", "/pricing");
  });

  it.each([
    375, 768, 1280,
  ])("renders stably at requested viewport width %ipx without losing navigation semantics", async (width) => {
    setViewportWidth(width);
    fetchMock.mockResolvedValueOnce(
      createResponse({
        items: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
          nextCursor: null,
        },
      })
    );

    const { container, unmount } = renderOrdersView();
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    expect(container.querySelector("section.min-w-0")).toBeInTheDocument();
    unmount();
  });
});
