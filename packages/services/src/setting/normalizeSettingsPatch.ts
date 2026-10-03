import type { AppSettings } from "@knorvia/shared";

export function normalizeSettingsPatch(patch: Partial<AppSettings>): Partial<AppSettings> {
  const normalized = { ...patch };
  if (typeof normalized.locale === "string" && !("localePreference" in normalized)) {
    normalized.localePreference = normalized.locale;
  }
  for (const key of [
    "terminalFontFamily",
    "httpProxy",
    "httpProxyNoProxy",
    "httpProxyCaCertPath",
  ] as const) {
    const value = normalized[key];
    if (typeof value === "string") normalized[key] = value.trim() || undefined;
  }
  const shell = normalized.integratedTerminalShell;
  if (shell?.mode === "auto") normalized.integratedTerminalShell = undefined;
  if (shell?.mode === "shell") {
    normalized.integratedTerminalShell = {
      ...shell,
      id: shell.id.trim(),
      label: shell.label.trim(),
      path: shell.path.trim(),
    };
  }
  return normalized;
}
