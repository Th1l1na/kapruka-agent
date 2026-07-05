"use client";

import { useEffect, useState } from "react";
import { type Language, COPY } from "@/lib/ai/language";

/**
 * Dark/light theme toggle (Sprint 5, ui-redesign).
 *
 * Dark is the default look, so the SSR markup ships with `.dark` on <html>
 * (see layout.tsx) and this button initialises to "dark" too — no hydration
 * mismatch. After mount, a useEffect reconciles with the persisted choice in
 * localStorage; a second effect applies the class to <html> and persists.
 * Toggling only adds/removes `class="dark"`, which drives Tailwind's `dark:`
 * utilities (class-based variant configured in globals.css).
 */
type Theme = "dark" | "light";
const STORAGE_KEY = "kapruka-theme";

function SunIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle({ language }: { language: Language }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // Reconcile with the persisted choice after hydration (reading localStorage
  // during render would mismatch the server-rendered "dark" default).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  // Apply to <html> and persist whenever the theme changes.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const isDark = theme === "dark";
  // Label describes the ACTION (where the click takes you), for screen readers.
  const label = isDark
    ? COPY[language].themeToggle.toLight
    : COPY[language].themeToggle.toDark;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-600 transition hover:text-emerald-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-emerald-400"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
