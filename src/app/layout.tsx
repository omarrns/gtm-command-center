import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTM Command Center",
  description:
    "Omar's browser-based operating system for job analysis, outreach, research, and coaching.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
