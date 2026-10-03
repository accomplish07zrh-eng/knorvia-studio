import type { BrowserPageState } from "@knorvia/shared";
import type { ControlledViewWebContents } from "./browserCommandTypes.js";
export declare const DEFAULT_NAVIGATE_SETTLE_MS = 10000;
export declare class BrowserNavigationTimeoutError extends Error {
    name: string;
}
export declare function isAllowedBrowserUrl(rawUrl: string): boolean;
export declare function now(): number;
export declare function readState(wc: ControlledViewWebContents): BrowserPageState;
export declare function settleNavigation(loadPromise: Promise<void>, timeoutMs: number, signal?: AbortSignal): Promise<void>;
