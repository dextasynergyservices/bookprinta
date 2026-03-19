import type { Metadata } from "next";
import dynamic from "next/dynamic";

const AdminResourcesWorkspaceView = dynamic(
  () => import("./AdminResourcesWorkspaceView").then((mod) => mod.AdminResourcesWorkspaceView),
  {
    loading: () => (
      <section className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-56 animate-pulse rounded bg-white/10" />
        <div className="h-32 w-full animate-pulse rounded bg-white/10" />
      </section>
    ),
  }
);

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminResourcesPage() {
  return <AdminResourcesWorkspaceView />;
}
