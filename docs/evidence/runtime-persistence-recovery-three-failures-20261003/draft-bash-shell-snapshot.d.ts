import type { ExecutionShellSelection, Logger, SessionId, SessionStorePort, TraceContext } from "../deps.js";
export type BashShellSnapshotRestore = {
    status: "restored";
    selection: ExecutionShellSelection;
} | {
    status: "fallback";
    reason: "stale_snapshot";
    selection: ExecutionShellSelection;
    staleSelection: ExecutionShellSelection;
} | {
    status: "stale";
    staleSelection: ExecutionShellSelection;
} | {
    status: "missing" | "invalid" | "read_failed";
};
export declare function persistBashShellSelectionSnapshot(options: {
    logger?: Logger;
    selection: ExecutionShellSelection | undefined;
    sessionId: SessionId;
    sessionStore: SessionStorePort | undefined;
    traceContext: TraceContext;
}): Promise<void>;
export declare function readPersistedBashShellSelectionSnapshot(options: {
    logger?: Logger;
    sessionId: SessionId;
    sessionStore: SessionStorePort | undefined;
    traceContext: TraceContext;
}): Promise<BashShellSnapshotRestore>;
export declare function resolveBashShellSnapshotForResume(options: {
    currentSelection: ExecutionShellSelection | undefined;
    logger?: Logger;
    restore: BashShellSnapshotRestore;
    traceContext: TraceContext;
}): BashShellSnapshotRestore;
//# sourceMappingURL=bash-shell-snapshot.d.ts.map