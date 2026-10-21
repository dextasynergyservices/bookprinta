/**
 * Testing Library re-export with the providers components actually need.
 *
 * Why this exists: 51 modules in this app use TanStack Query, and
 * `useQueryClient()` throws "No QueryClient set" when rendered without a
 * provider. Components acquire that dependency over time — often indirectly,
 * via a child like `processing-progress-stepper` — which silently breaks every
 * test that renders an ancestor with a bare `render()`. That is how 8 suites
 * ended up failing for a reason unrelated to what they were testing.
 *
 * Importing `render` from here instead of `@testing-library/react` makes a test
 * immune to that class of breakage: a descendant can start using react-query
 * without the test needing to know.
 *
 * This is the standard RTL "custom render" pattern. Nesting is harmless, so
 * tests that already wrap in their own `QueryClientProvider` can switch to this
 * import without changing anything else.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render as rtlRender } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/**
 * A client configured for tests, not for production.
 *
 * `retry: false` so a deliberately failing query surfaces immediately instead
 * of burning the test's timeout on retries, and caching is disabled so each
 * render starts from a known state.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // No retries: a deliberately failing query should surface at once
        // instead of burning the test timeout.
        retry: false,
        // Never refetch on its own. `staleTime: 0` plus `gcTime: 0` made every
        // query immediately stale and uncached, so anything mounted re-fetched
        // and re-rendered continuously. That churn remounted rows mid-
        // interaction and closed Radix menus the moment they opened — the
        // trigger reported data-state="closed" and the menu looked like it had
        // never responded to the click.
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchInterval: false,
      },
      mutations: { retry: false },
    },
  });
}

export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  /** Pass an existing client to assert on its cache after rendering. */
  queryClient?: QueryClient;
};

/**
 * Renders inside the providers the app supplies at runtime.
 *
 * Returns the `queryClient` alongside RTL's usual result so a test can inspect
 * or invalidate cache entries.
 */
/**
 * Declared at module scope on purpose.
 *
 * Defining the wrapper inside `renderWithProviders` created a NEW component
 * type on every call. React treats a changed type as a different component and
 * unmounts/remounts the whole tree rather than updating it, which throws away
 * the state of anything mid-interaction. Radix primitives keep their open/close
 * state internally, so a dropdown opened by a click was immediately remounted
 * closed — the trigger reported `data-state="closed"` and the menu never
 * appeared, looking exactly like the click had not registered.
 *
 * Keeping the type stable means re-renders stay re-renders.
 */
function ProvidersWrapper({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  return {
    ...rtlRender(ui, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ProvidersWrapper client={queryClient}>{children}</ProvidersWrapper>
      ),
      ...renderOptions,
    }),
    queryClient,
  };
}

// Re-export everything else so a test only changes its import path, never its body.
export * from "@testing-library/react";

/**
 * Shadows RTL's `render` deliberately, so `import { render } from "@/test-utils"`
 * is a drop-in replacement. Must come after the star export to win.
 */
export { renderWithProviders as render };
