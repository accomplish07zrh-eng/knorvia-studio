// Body-free supporting port/type facts; actual existing imports remain authoritative.
export interface SessionInfo {
    id: SessionId;
    projectID: ProjectId;
    workspaceID?: WorkspaceId;
    parentID?: SessionId;
    traceID?: TraceId;
    taskType: SessionTaskType;
    slug: string;
    directory: string;
    path?: string;
    title: string;
    titleSource?: SessionTitleSource;
    titleMessageID?: MessageId;
    version: string;
    shareURL?: string;
    summaryAdditions?: number;
    summaryDeletions?: number;
    summaryFiles?: number;
    summaryDiffs?: FileDiff[];
    revert?: SessionRevert;
    permission?: PermissionRuleset;
    time: {
        created: number;
        updated: number;
        titleUpdated?: number;
        compacting?: number;
        archived?: number;
    };
}
export interface RepairRemoteSessionPathsInput {
    sessionID: SessionId;
    workspaceID: WorkspaceId;
    expectedDirectory: string;
    expectedPath: string | null;
    directory: string;
    path: string | null;
    timeUpdated: number;
}
