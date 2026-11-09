import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { WorkspaceShell } from "@/components/workspace-shell";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Sands PCN Management",
  title: "Sands PCN Management",
  description: "Private operational dashboard for managing penalty charge notices.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#356957" },
    { media: "(prefers-color-scheme: dark)", color: "#111a17" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'try{const t=localStorage.getItem("pcn-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch{}' }} />
      </head>
      <body><ServiceWorkerRegistration /><WorkspaceShell>{children}</WorkspaceShell></body>
    </html>
  );
}
