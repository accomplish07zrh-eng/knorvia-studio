import { createRoot } from "react-dom/client";
import type { ResourceUsageSnapshot, StorageManagementBridge } from "@knorvia/shared";
import "@knorvia/ui/styles.css";
import {
  ResourceManagerApp,
  KnorviaIntlProvider,
  applyUiFontSizePx,
  loadUiFontSizePx,
  subscribeToUiFontSizeStorageChanges,
} from "@knorvia/ui";

declare global {
  interface Window {
    resourceManager?: {
      getSnapshot: () => Promise<ResourceUsageSnapshot>;
      setSamplingActive: (active: boolean) => void;
      storage?: StorageManagementBridge;
    };
  }
}

type Theme = "light" | "dark" | "knorvia-light" | "knorvia-dark" | "system";

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme === "dark" || theme === "knorvia-dark" ? "dark" : "light";
}

function applyResourceManagerTheme(): void {
  const savedTheme = (localStorage.getItem("knorvia-theme") as Theme | null) ?? "knorvia-light";
  const resolvedTheme = resolveTheme(savedTheme);
  const appliedTheme =
    savedTheme === "system"
      ? resolvedTheme === "dark"
        ? "knorvia-dark"
        : "knorvia-light"
      : savedTheme === "dark"
        ? "knorvia-dark"
        : savedTheme === "light"
          ? "knorvia-light"
          : savedTheme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.classList.toggle("theme-knorvia-light", appliedTheme === "knorvia-light");
  document.documentElement.classList.toggle("theme-knorvia-dark", appliedTheme === "knorvia-dark");
}

applyResourceManagerTheme();
// 资源管理器不创建主窗口的 Zustand store，text-ui-* 无法自动获得持久化基准。
// 首屏前显式应用，运行中再由 storage 事件同步，且不改变 html font-size 或接入业务 Host。
applyUiFontSizePx(loadUiFontSizePx());
subscribeToUiFontSizeStorageChanges();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    // 语言沿用主窗口写入 localStorage 的偏好；不接 settingService，避免独立窗口再起一份 RPC。
    <KnorviaIntlProvider>
      <ResourceManagerApp
        setSamplingActive={window.resourceManager?.setSamplingActive}
        getSnapshot={
          window.resourceManager ? () => window.resourceManager!.getSnapshot() : undefined
        }
        storage={window.resourceManager?.storage}
      />
    </KnorviaIntlProvider>,
  );
}
