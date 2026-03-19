import type { Metadata } from "next";
import { AdminSystemSettingsLanding } from "../AdminSystemSettingsLanding";

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

export default function AdminSystemSettingsPage() {
  return <AdminSystemSettingsLanding />;
}
