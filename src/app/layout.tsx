import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "PCN Management",
  description: "Private operational dashboard for managing penalty charge notices.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
