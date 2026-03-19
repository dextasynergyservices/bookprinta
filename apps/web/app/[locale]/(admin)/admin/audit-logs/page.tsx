import type { Metadata } from "next";
import { AdminAuditLogsLanding } from "../AdminAuditLogsLanding";

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

export default function AdminAuditLogsPage() {
  return <AdminAuditLogsLanding />;
}
