import { useEffect, useState, useCallback } from "react";
import { normalizeStoredThemePreference, type ThemePreference } from "@knorvia/shared";

export type Theme = ThemePreference;
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "knorvia-theme";
const BROWSER_THEME_SURFACE_ATTRIBUTE = "data-knorvia-browser-theme-surface";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme();
  }

  return theme === "dark" || theme === "knorvia-dark" ? "dark" : "light";
}

export function normalizeThemePreference(theme: Theme): Theme {
  return normalizeStoredThemePreference(theme) ?? "knorvia-light";
}

function setThemeMetaContent(name: "theme-color" | "color-scheme", content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
}

function syncBrowserThemeSurface(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (
    typeof root.hasAttribute !== "function" ||
    !root.hasAttribute(BROWSER_THEME_SURFACE_ATTRIBUTE)
  ) {
    return;
  }

  // Electron 为 vibrancy 保持透明根背景，但普通浏览器需要从文档根和标准 meta
  // 获得页面主题。只切换 React 的 dark class 会让浏览器工具栏、原生控件和 overscroll 留在旧主题。
  root.setAttribute(BROWSER_THEME_SURFACE_ATTRIBUTE, resolved);
  root.style.colorScheme = resolved;
  setThemeMetaContent("color-scheme", resolved);

  const background = getComputedStyle(root).getPropertyValue("--color-background").trim();
  if (background) {
    setThemeMetaContent("theme-color", background);
  }
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  const appliedTheme =
    theme === "system"
      ? resolved === "dark"
        ? "knorvia-dark"
        : "knorvia-light"
      : normalizeThemePreference(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.toggle(
    "theme-knorvia-light",
    appliedTheme === "knorvia-light",
  );
  document.documentElement.classList.toggle("theme-knorvia-dark", appliedTheme === "knorvia-dark");
  syncBrowserThemeSurface(resolved);
}

export function resolveInitialThemePreference(saved: string | null): Theme {
  return normalizeStoredThemePreference(saved) ?? "knorvia-light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return resolveInitialThemePreference(saved);
  });

  const setTheme = useCallback((t: Theme) => {
    const normalizedTheme = normalizeThemePreference(t);
    localStorage.setItem(STORAGE_KEY, normalizedTheme);
    setThemeState(normalizedTheme);
    applyTheme(normalizedTheme);
  }, []);

  // 初始化 + system 模式下监听系统偏好变化
  useEffect(() => {
    applyTheme(theme);
    // 读取旧偏好后只写当前身份，避免下一窗口继续沿用旧字段。
    try {
      if (localStorage.getItem(STORAGE_KEY) !== theme) localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 浏览器禁用存储时仍允许本窗口正常切换主题。
    }

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme } as const;
}
