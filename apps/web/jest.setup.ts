import "@testing-library/jest-dom";

import { TextDecoder, TextEncoder } from "node:util";

/**
 * jsdom does not expose TextEncoder/TextDecoder, which Next.js internals
 * require. Any test that transitively imports `next/cache` — for instance a
 * hook that calls the on-demand revalidation Server Action — fails to even load
 * with "TextEncoder is not defined", pointing at the imported file rather than
 * at the missing global.
 *
 * Node has both; jsdom simply does not install them on its window.
 */
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

/**
 * jsdom does not implement `window.matchMedia`, and several things in this app
 * reach for it during render — Framer Motion's `useReducedMotion`, and our own
 * responsive hooks that branch on viewport width.
 *
 * Without a stub the call throws "window.matchMedia is not a function" while the
 * component tree is rendering, so the test fails before it can assert anything.
 * Patching it here rather than in each test keeps the next component that uses a
 * media query from quietly breaking unrelated suites.
 *
 * Defaults to "does not match", which means tests see the desktop /
 * motion-enabled branch unless they override it. A test that needs the other
 * branch should override `window.matchMedia` itself and restore it afterwards.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        // Both the legacy and modern listener APIs — libraries use either.
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

/**
 * jsdom stubs that Radix UI primitives require.
 *
 * Radix menus, selects and dialogs drive their open/close state from Pointer
 * Events and call these DOM APIs during interaction. jsdom implements none of
 * them, so `userEvent.click()` on a trigger silently fails to open the menu —
 * the test then reports "unable to find role=menuitem", which reads like a
 * missing element rather than an unimplemented browser API.
 */
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

/**
 * jsdom has no ResizeObserver, which Radix's floating primitives (dropdown,
 * select, popover, tooltip) construct when positioning their content. Without
 * it the constructor throws during open, so the menu never mounts.
 */
if (typeof globalThis !== "undefined" && typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

/**
 * jsdom implements no PointerEvent, so pointer events dispatched by
 * @testing-library fall back to a generic Event with no `button` property.
 *
 * Radix opens a DropdownMenuTrigger from `pointerdown` and guards on
 * `event.button === 0 && event.ctrlKey === false`. With `button` undefined that
 * guard fails, the menu never opens, and the test reports a missing
 * `role="menuitem"` — indistinguishable from the items not being rendered.
 *
 * Extending MouseEvent gives the mouse-button and modifier fields Radix reads.
 */
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    public readonly pointerId: number;
    public readonly pointerType: string;
    public readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }

  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
  globalThis.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}
