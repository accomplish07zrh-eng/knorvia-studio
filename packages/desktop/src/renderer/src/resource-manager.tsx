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
import { resolveRendererAppearance } from "./rendererAppearance.js";

declare global {
  interface Window {
    resourceManager?: {
      getSnapshot: () => Promise<ResourceUsageSnapshot>;
      setSamplingActive: (active: boolean) => void;
      storage?: StorageManagementBridge;
    };
  }
}

function mountResourceManager(): void {
  const appearance = resolveRendererAppearance(
    localStorage.getItem("knorvia-theme") ?? "knorvia-light",
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  document.documentElement.classList.toggle("dark", appearance.dark);
  document.documentElement.classList.toggle(
    "theme-knorvia-light",
    appearance.theme === "knorvia-light",
  );
  document.documentElement.classList.toggle(
    "theme-knorvia-dark",
    appearance.theme === "knorvia-dark",
  );

  // This window has no main-window store or RPC; apply persistence before mount.
  applyUiFontSizePx(loadUiFontSizePx());
  subscribeToUiFontSizeStorageChanges();
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(
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

mountResourceManager();
