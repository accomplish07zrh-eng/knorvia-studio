import type { UtilityProcess as ElectronUtilityProcess } from "electron";

export declare class BroadcastHub {
  collectMemoryDiagnostics(): Record<string, number>;
  register(windowId: number, child: ElectronUtilityProcess): void;
  unregister(windowId: number): void;
}
