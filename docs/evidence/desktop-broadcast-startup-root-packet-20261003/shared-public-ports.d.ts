// Bounded dependency declarations/aliases only. Reuse canonical implementations.
export {
  HostMessageTypes,
  HostResponseTypes,
  InternalChannels,
  broadcastMessageSchema,
  hostResponseMessageSchema,
  databaseStartupControlSchema,
  formatZodError,
} from "@knorvia/shared";
export type { DatabaseStartupState, DatabaseStartupControl } from "@knorvia/shared";
export type { BroadcastMessage } from "@knorvia/services";

import type { DatabaseStartupState } from "@knorvia/shared";
import type { ipcMain, BrowserWindow, UtilityProcess } from "electron";
export type NativeIpcAdmissionPort = Pick<typeof ipcMain, "on" | "removeListener">;
export type NativeWindowIdentity = BrowserWindow;
export type NativeChildIdentity = UtilityProcess;
export declare function reportDatabaseStartupState(state: DatabaseStartupState): void;
export declare const logger: { warn: (...args: unknown[]) => void };
