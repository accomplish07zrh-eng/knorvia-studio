import { type AppSettings, type ReleaseUpdateCheckResult } from "@knorvia/shared";
export declare const FIRST_RELEASE_CHECK_DELAY_MS = 30000;
export declare const RELEASE_CHECK_INTERVAL_MS: number;
export declare function checkReleaseUpdate(options: {
    getSettings: () => Promise<Pick<AppSettings, "releaseInfoUrl" | "releaseChecksEnabled">>;
    currentVersion: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}): Promise<ReleaseUpdateCheckResult>;
export declare function scheduleReleaseUpdateChecks(check: () => Promise<ReleaseUpdateCheckResult>, onResult: (result: ReleaseUpdateCheckResult) => void): () => void;
