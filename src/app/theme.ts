// Light/dark theme control. The instrument supports both (reference artifact). We stamp the
// active theme on the root `.lb-app` element as `data-theme`; styles.css keys everything off
// that attribute. Preference persists in localStorage; first visit follows the OS setting.

import type { Theme } from "./mapStyle";

const STORAGE_KEY = "lb.theme";

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage unavailable (private mode / SSR) — fall through to the OS preference.
  }
  const prefersDark =
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Persistence is best-effort; the stamped attribute is what actually drives the UI.
  }
}

export const otherTheme = (t: Theme): Theme => (t === "dark" ? "light" : "dark");
