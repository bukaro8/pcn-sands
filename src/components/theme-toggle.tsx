"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "pcn-theme";
const changeEvent = "pcn-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(changeEvent, onChange);
  return () => window.removeEventListener(changeEvent, onChange);
}

function currentTheme() {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle({ compact = false, floating = false }: { compact?: boolean; floating?: boolean }) {
  const dark = useSyncExternalStore(subscribe, currentTheme, () => false);

  function toggleTheme() {
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    window.dispatchEvent(new Event(changeEvent));
    try { localStorage.setItem(storageKey, nextDark ? "dark" : "light"); }
    catch { /* The selected theme still applies for this page. */ }
  }

  return (
    <button
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className={`theme-toggle ${floating ? "theme-toggle-floating" : ""}`}
      onClick={toggleTheme}
      type="button"
    >
      {dark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      {!compact && <span>{dark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
