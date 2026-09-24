import { normalizeStoredThemePreference, type ThemePreference } from "@knorvia/shared";

type WebThemeSeed = ThemePreference;

export const WEB_DEFAULT_THEME: WebThemeSeed = "knorvia-light";

export function resolveWebInitialTheme({
  storedTheme,
  defaultTheme = WEB_DEFAULT_THEME,
}: {
  storedTheme?: string | null;
  defaultTheme?: WebThemeSeed;
}): WebThemeSeed {
  return normalizeStoredThemePreference(storedTheme)
    ?? normalizeStoredThemePreference(defaultTheme)
    ?? "knorvia-light";
}
