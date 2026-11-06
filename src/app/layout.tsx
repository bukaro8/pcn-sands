import type { Metadata } from "next";

import { ThemeToggle } from "@/components/theme-toggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "PCN Management",
  description: "Private operational dashboard for managing penalty charge notices.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className="dark" lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'try{if(localStorage.getItem("pcn-theme")==="light")document.documentElement.classList.remove("dark")}catch{}' }} />
      </head>
      <body>{children}<ThemeToggle /></body>
    </html>
  );
}
