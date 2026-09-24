import { release } from "node:os";
import { nativeTheme, type BrowserWindow } from "electron";

export function applyDesktopWindowGlass(win: BrowserWindow, enabled: boolean): boolean {
  const background = nativeTheme.shouldUseDarkColors ? "#161616" : "#f8f8f8";
  if (process.platform === "win32" && Number(release().split(".")[2]) >= 22621) {
    win.setBackgroundMaterial(enabled ? "acrylic" : "none");
    win.setBackgroundColor(enabled ? "#00000000" : background);
    return true;
  }
  if (process.platform === "darwin") {
    win.setVibrancy(enabled ? "under-window" : null);
    win.setBackgroundColor(enabled ? "#00000000" : background);
    return true;
  }
  return false;
}
