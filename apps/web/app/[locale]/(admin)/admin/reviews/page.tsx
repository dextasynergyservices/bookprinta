import type { Metadata } from "next";
import { AdminReviewsView } from "./AdminReviewsView";

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

export default function AdminReviewsPage() {
  return <AdminReviewsView />;
}
