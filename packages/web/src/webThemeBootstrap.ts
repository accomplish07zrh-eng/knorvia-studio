import { resolveWebInitialTheme } from "./webThemeSeed.js";

/** Seed the first frame; UI useTheme owns all subsequent preference changes. */
export function initializeWebTheme(): void {
  const preference = resolveWebInitialTheme({
    storedTheme: localStorage.getItem("knorvia-theme"),
  });
  const dark =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : preference === "dark" || preference === "knorvia-dark";
  const classes: readonly [string, boolean][] = [
    ["dark", dark],
    ["theme-knorvia-light", !dark],
    ["theme-knorvia-dark", dark],
  ];
  for (const [name, enabled] of classes) {
    document.documentElement.classList.toggle(name, enabled);
  }
}
