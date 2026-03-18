import type { Metadata } from "next";
import { AdminPackagesWorkspaceView } from "./AdminPackagesWorkspaceView";

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

export default function PackagesPage() {
  return <AdminPackagesWorkspaceView />;
}
