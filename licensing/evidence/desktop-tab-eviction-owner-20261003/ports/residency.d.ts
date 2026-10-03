export declare const BROWSER_TAB_LIMIT = 32;
export type BrowserTabResidency = "live-visible" | "live-background" | "suspend-pending" | "suspended" | "restoring";
export interface BrowserTabResidencyCandidate {
    tabId: string;
    windowId: number;
    sessionId: string;
    residency: BrowserTabResidency;
    guestAttached: boolean;
    openedAt: number;
    lastActivityAt: number;
    lastSelectedAt: number | null;
    preferred: boolean;
    currentTask: boolean;
    selected: boolean;
    visible: boolean;
    operationActive: boolean;
    captureActive: boolean;
    audible: boolean;
    mediaActive: boolean;
    loading: boolean;
    downloadActive: boolean;
}
interface BrowserTabResidencySelectionOptions {
    windowId: number;
    tabLimit?: number;
}
export declare function selectBrowserTabLimitVictim(candidates: readonly BrowserTabResidencyCandidate[], options: BrowserTabResidencySelectionOptions): BrowserTabResidencyCandidate | null;
export {};
