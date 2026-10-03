// Advisory source-grounded return contracts supplement inherited isolated inference diagnostics.
// Not a replacement for original public declaration records or semantic project compilation.
import type { Tray } from "electron";
import type { CuaOsSupport } from "@knorvia/shared";
export interface PrimaryWindowCoordinatorReturnContract {
  ensurePrimaryWindow(reason: string): Promise<void>;
}
export type WindowsDesktopTrayReturnContract = Tray | null;
export type DesktopCommandReturnContract = Promise<void | CuaOsSupport>;
// CuaOsSupport is returned only by GetCuaOsSupport; other cases/unknown commands resolve void.
// resolveCommunityUrl separately retains Promise<string | undefined> and currently resolves undefined.
