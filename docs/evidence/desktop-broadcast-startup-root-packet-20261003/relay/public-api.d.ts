import type { BrowserWindow, UtilityProcess } from "electron";
import type { DatabaseStartupState } from "@knorvia/shared";

export declare function configureDatabaseStartupQuit(handler: () => void): void;
export declare function onLocalDatabaseStartupReady(listener: () => void): void;
export declare function getDatabaseStartupPortPayload(
  child: UtilityProcess,
): { databaseStartupId: string } | undefined;
export declare function bindDatabaseStartupRelay(
  win: BrowserWindow,
  child: UtilityProcess,
  startupId?: string,
): { receive: (state: DatabaseStartupState) => void; startupId: string };
