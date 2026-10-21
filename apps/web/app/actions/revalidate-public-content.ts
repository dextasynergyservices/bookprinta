"use server";

import { revalidatePath } from "next/cache";

/**
 * On-demand revalidation of admin-managed public content.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * Marketing pages are statically regenerated, so an admin edit to pricing,
 * showcase entries or resources only reached visitors when the ISR window
 * elapsed. Lowering that window shortens the delay but trades it for constant
 * regeneration, and it never actually makes a change *immediate*.
 *
 * Revalidating on the mutation inverts that: pages stay cached indefinitely
 * until the content genuinely changes, at which point the next request rebuilds
 * them. Fresher AND cheaper than polling for staleness.
 *
 * ─── Why a Server Action ───────────────────────────────────────────────────
 *
 * CLAUDE.md constraint #33 forbids Next.js API routes — all HTTP endpoints live
 * in NestJS. A Server Action is not an API route; it is the framework's own
 * mechanism for running privileged server code from a client component, and
 * `revalidatePath` can only run inside the Next.js server runtime. So this is
 * the one correct home for it.
 *
 * ─── Why the "[locale]" paths ──────────────────────────────────────────────
 *
 * Routes are locale-prefixed via next-intl (`/`, `/fr`, `/es`, `/pricing`,
 * `/fr/pricing`, …). Passing a concrete path would revalidate exactly ONE
 * locale and silently leave the others stale. Passing the dynamic segment with
 * `type: "page"` revalidates every locale variant of that page in one call.
 *
 * Route groups like `(marketing)` do not appear in the URL and must be omitted.
 */

/** Which area of public content changed. */
export type PublicContentScope = "pricing" | "showcase" | "resources";

/**
 * Pages affected by each scope.
 *
 * The homepage appears under both `pricing` and `showcase` because it renders a
 * pricing preview and a featured-authors strip.
 */
const PATHS_BY_SCOPE: Record<PublicContentScope, readonly string[]> = {
  pricing: ["/[locale]", "/[locale]/pricing"],
  showcase: ["/[locale]", "/[locale]/showcase"],
  resources: ["/[locale]/resources", "/[locale]/resources/[slug]"],
};

/**
 * Rebuild the public pages affected by an admin change.
 *
 * Deliberately never throws. This runs from a mutation's success handler, and
 * the write has already committed — failing the caller because a cache hint did
 * not land would turn a successful save into a visible error. The worst case
 * without it is that the page refreshes on its normal ISR schedule instead.
 */
export async function revalidatePublicContent(scope: PublicContentScope): Promise<void> {
  try {
    for (const path of PATHS_BY_SCOPE[scope]) {
      revalidatePath(path, "page");
    }
  } catch (error) {
    console.error(
      `[revalidatePublicContent] failed for scope "${scope}"; pages will refresh on their normal schedule:`,
      error
    );
  }
}
