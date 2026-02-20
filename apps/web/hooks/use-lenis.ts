import { type LenisContextValue, useLenisContext } from "@/components/shared/lenis-provider";

/**
 * Access the global Lenis smooth scroll instance from any component.
 *
 * @example
 * const { scrollTo } = useLenis();
 *
 * // Scroll to a section by CSS selector
 * scrollTo("#pricing");
 *
 * // Scroll to top
 * scrollTo(0);
 *
 * // Scroll to a DOM element ref
 * scrollTo(myRef.current, { offset: -80 });
 */
export function useLenis(): LenisContextValue {
  return useLenisContext();
}
