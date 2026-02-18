import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "BookPrinta — Publish Your Book",
  description:
    "Turn your manuscript into a professional, print-ready book. Professional publishing made simple for Nigerian authors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
