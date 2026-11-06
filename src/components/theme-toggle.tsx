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

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, currentTheme, () => true);

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
      className="theme-toggle fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      onClick={toggleTheme}
      type="button"
    >
      {dark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
