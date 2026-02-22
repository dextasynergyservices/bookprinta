import { notFound } from "next/navigation";

/**
 * Catch-all route for any URL that doesn't match an existing page under [locale].
 * Calling notFound() here triggers the locale-aware [locale]/not-found.tsx
 * which has access to translations and the full themed UI.
 */
export default function CatchAllPage() {
  notFound();
}
