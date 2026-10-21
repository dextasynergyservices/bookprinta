/**
 * Test stub for `next/cache`.
 *
 * Mapped in jest.config.ts. Importing the real module drags in Next.js server
 * internals that expect a server runtime — `TextEncoder`, then `Request`, then
 * more — so any jsdom test that transitively reaches it fails to even load,
 * with an error pointing at the importing file rather than the missing globals.
 *
 * Client hooks legitimately import the on-demand revalidation Server Action
 * (that is the standard Next.js pattern: the bundler turns the import into an
 * RPC stub). Jest has no such bundler, so it resolves the real module instead.
 * Stubbing the cache primitives keeps those hooks importable without pretending
 * to run a server.
 *
 * Revalidation behaviour itself is asserted directly in
 * app/actions/revalidate-public-content.test.ts, which mocks this module with
 * its own spy.
 */
export function revalidatePath(_path: string, _type?: "page" | "layout"): void {
  // Intentionally inert: nothing to revalidate in a test environment.
}

export function revalidateTag(_tag: string): void {
  // Intentionally inert.
}

export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
