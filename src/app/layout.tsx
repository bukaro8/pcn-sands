import type { Metadata } from "next";

import { WorkspaceShell } from "@/components/workspace-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "PCN Management",
  description: "Private operational dashboard for managing penalty charge notices.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'try{const t=localStorage.getItem("pcn-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch{}' }} />
      </head>
      <body><WorkspaceShell>{children}</WorkspaceShell></body>
    </html>
  );
}
