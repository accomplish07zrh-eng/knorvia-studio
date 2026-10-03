// Public supporting type facts only; dependency locations are labels.
// apps/cli/packages/core/src/runtime/methods/bash-shell-snapshot.ts
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
