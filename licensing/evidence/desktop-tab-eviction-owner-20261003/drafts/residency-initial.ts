export const BROWSER_TAB_LIMIT = 32;

export type BrowserTabResidency =
    | "live-visible"
    | "live-background"
    | "suspend-pending"
    | "suspended"
    | "restoring";

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

export function selectBrowserTabLimitVictim(
    candidates: readonly BrowserTabResidencyCandidate[],
    options: BrowserTabResidencySelectionOptions,
): BrowserTabResidencyCandidate | null {
    const tabLimit = options.tabLimit ?? BROWSER_TAB_LIMIT;
    const windowCandidates = candidates.filter(
        (candidate) => candidate.windowId === options.windowId,
    );

    if (windowCandidates.length <= tabLimit) {
        return null;
    }

    const eligible = windowCandidates.filter(
        (candidate) =>
            !(
                candidate.residency === "live-visible" ||
                candidate.residency === "restoring" ||
                candidate.residency === "suspend-pending" ||
                candidate.selected ||
                candidate.visible ||
                candidate.operationActive ||
                candidate.captureActive ||
                candidate.audible ||
                candidate.mediaActive ||
                candidate.loading ||
                candidate.downloadActive
            ),
    );

    eligible.sort((left, right) => {
        const activityDelta = left.lastActivityAt - right.lastActivityAt;
        if (activityDelta !== 0) {
            return activityDelta;
        }

        const selectionDelta =
            (left.lastSelectedAt ?? Number.NEGATIVE_INFINITY) -
            (right.lastSelectedAt ?? Number.NEGATIVE_INFINITY);
        if (selectionDelta !== 0) {
            return selectionDelta;
        }

        const openedDelta = left.openedAt - right.openedAt;
        if (openedDelta !== 0) {
            return openedDelta;
        }

        return left.tabId.localeCompare(right.tabId);
    });

    return eligible[0] ?? null;
}

export {};
