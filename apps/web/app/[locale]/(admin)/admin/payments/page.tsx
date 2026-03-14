import type { Metadata } from "next";
import { AdminPaymentsView } from "./AdminPaymentsView";

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

export default function AdminPaymentsPage() {
  return <AdminPaymentsView />;
}
