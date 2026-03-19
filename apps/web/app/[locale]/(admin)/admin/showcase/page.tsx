import type { Metadata } from "next";
import { AdminShowcaseWorkspaceView } from "./AdminShowcaseWorkspaceView";

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

export default function ShowcasePage() {
  return <AdminShowcaseWorkspaceView />;
}
