import type { AppSettings } from "@knorvia/shared";
export type ReleaseCheckSettings = Pick<AppSettings,"releaseInfoUrl"|"releaseChecksEnabled">;
// Relevant actual fields on AppSettings: releaseInfoUrl?:string; releaseChecksEnabled?:boolean. Other settings remain opaque.
export type ReleaseUpdateCheckResult = {
    status: "unconfigured" | "disabled";
    currentVersion: string;
} | {
    status: "up-to-date";
    currentVersion: string;
    latestVersion: string;
} | {
    status: "no-compatible-release";
    currentVersion: string;
} | {
    status: "available";
    currentVersion: string;
    latestVersion: string;
    releaseUrl?: string;
} | {
    status: "failed";
    currentVersion: string;
    reason: "settings" | "invalid-source" | "offline" | "timeout" | "http" | "invalid-response";
    httpStatus?: number;
};
export interface TaskNotificationPayload {
    taskId: string;
    status: "completed" | "failed" | "permission_request" | "elicitation_request" | "feedback_update";
    requestId?: string;
    title: string;
    body: string;
}
