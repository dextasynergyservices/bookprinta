import type { Metadata } from "next";
import { AdminUsersView } from "./AdminUsersView";

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

export default function AdminUsersPage() {
  return <AdminUsersView />;
}
