// Distinct existing module surfaces; authoritative imported types stay with their owners.
import type { UtilityProcess } from "electron";
import type { AppSettings, TaskNotificationPayload } from "@knorvia/shared";
import type { ZodError } from "zod";
// @knorvia/shared:
export declare function validReleaseInfoUrl(value:string):boolean;
export declare function formatZodError(error:ZodError):string;
export declare const taskNotificationPayloadSchema:typeof import("@knorvia/shared").taskNotificationPayloadSchema;
export declare const PlatformChannels:typeof import("@knorvia/shared").PlatformChannels;
export declare const HostMessageTypes:typeof import("@knorvia/shared").HostMessageTypes;
// ./desktopRuntimeEnv.js: preserve actual inferred env type, do not duplicate env/credential logic.
export declare const buildHostProcessEnv:typeof import("./desktopRuntimeEnv.js").buildHostProcessEnv;
export declare const schedulerModulePath:typeof import("./desktopRuntimeEnv.js").schedulerModulePath;
// ./processResourceSelfHeapSource.js:
export declare function ingestSchedulerSelfResourceSample(raw:unknown):void;
// ./resourceManagerWindow.js:
export declare function registerSchedulerProcess(child:UtilityProcess):void;
export declare function unregisterSchedulerProcess(child:UtilityProcess):void;
// external electron/semver namespace types remain authoritative, no handwritten replacement implementation:
export type ElectronNamespace=typeof import("electron");
export type SemverNamespace=typeof import("semver");
export type RelevantNotificationStatic=Pick<ElectronNamespace["Notification"],"isSupported">;
export type RelevantWindowStatic=Pick<ElectronNamespace["BrowserWindow"],"getAllWindows"|"fromWebContents">;
export type RelevantUtilityProcessStatic=Pick<ElectronNamespace["utilityProcess"],"fork">;
export type RelevantSemver=Pick<SemverNamespace,"valid"|"prerelease"|"gt">;
// Standard globals: fetch/Response/ReadableStreamDefaultReader/AbortController/TextDecoder/Uint8Array;
// setTimeout/setInterval clear counterparts and optional Node timer.unref. Their platform types are not redefined.
