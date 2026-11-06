"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BarChart3, Camera, ChevronLeft, FileText, Home, LogOut, Menu, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { logout } from "@/app/auth-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const collapseKey = "pcn-sidebar-collapsed";
const collapseEvent = "pcn-sidebar-change";
const navigation: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean; prominent?: boolean }> = [
  { href: "/", label: "Dashboard", icon: Home, exact: true },
  { href: "/pcns", label: "PCNs", icon: FileText },
  { href: "/pcns/capture", label: "Capture PCN", icon: Camera, prominent: true },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

function subscribe(onChange: () => void) {
  window.addEventListener(collapseEvent, onChange);
  return () => window.removeEventListener(collapseEvent, onChange);
}

function collapsedSnapshot() {
  try { return localStorage.getItem(collapseKey) === "true"; }
  catch { return false; }
}

function isActive(pathname: string, href: string, exact?: boolean) {
  if (href === "/pcns" && pathname.startsWith("/pcns/capture")) return false;
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, collapsedSnapshot, () => false);

  if (pathname === "/login") return <>{children}<ThemeToggle floating /></>;

  function toggleSidebar() {
    const next = !collapsed;
    try { localStorage.setItem(collapseKey, String(next)); } catch {}
    window.dispatchEvent(new Event(collapseEvent));
  }

  return (
    <div className={cn("workspace-shell", collapsed && "sidebar-is-collapsed")}>
      <aside className="workspace-sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><Sparkles aria-hidden="true" /></span>
          <span className="sidebar-label"><strong>Warm Workspace</strong><small>Sands PCN Management</small></span>
        </div>
        <nav aria-label="Workspace navigation" className="workspace-nav">
          {navigation.map(({ href, label, icon: Icon, exact, prominent }) => (
            <Link aria-current={isActive(pathname, href, exact) ? "page" : undefined} className={cn("workspace-nav-link", prominent && "workspace-nav-primary")} href={href} key={href} title={collapsed ? label : undefined}>
              <Icon aria-hidden="true" /><span className="sidebar-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="workspace-sidebar-footer">
          <ThemeToggle compact={collapsed} />
          <form action={logout}>
            <button className="workspace-nav-link" title={collapsed ? "Sign out" : undefined} type="submit"><LogOut aria-hidden="true" /><span className="sidebar-label">Sign out</span></button>
          </form>
          <button aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="sidebar-collapse" onClick={toggleSidebar} type="button">
            {collapsed ? <Menu aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}<span className="sidebar-label">Collapse</span>
          </button>
        </div>
      </aside>
      <div className="workspace-content">{children}</div>
      <nav aria-label="Mobile navigation" className="mobile-bottom-nav">
        {navigation.map(({ href, label, icon: Icon, exact, prominent }) => (
          <Link aria-current={isActive(pathname, href, exact) ? "page" : undefined} className={cn("mobile-nav-link", prominent && "mobile-nav-capture")} href={href} key={href}>
            <Icon aria-hidden="true" /><span>{label === "Capture PCN" ? "Capture" : label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
