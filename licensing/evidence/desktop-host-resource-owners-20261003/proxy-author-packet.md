# Fresh complete-owner boundary

User explicitly authorizes this selected G owner. Read ONLY this packet and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No inherited implementations, tests, dependency bodies, git/history, other packets/authors, config/env/network/previous drafts. Curator had selected inherited-source exposure and generated public API/external behavior facts. No predecessor private helper/state/decomposition/body is supplied. Names/types/static vocabulary are constrained contract data, no novelty requirement or credit.

Produce ONE complete TypeScript module with ONE literal heredoc to the stated fresh /tmp path, then SHA256 computation ONLY without reopening. No repo edits, test/execution/format/compile/install/network or actual host/process/browser/SSH/userfile/permission operations. Choose private structure freely. Report exact reads, whole-draft SHA, exports and uncertainty; ask curator for missing public-port facts before guessing. Later corrections require a fresh complete packet and new whole literal file, no previous draft reads/transforms. Shared filesystem access is instruction-limited, not OS clean-room certification.

## Output
/tmp/knorvia-host-proxy-author.ts
Complete packages/desktop/src/host/hostRemoteWorkspaceProxyState.ts.

## External behavior
- Factory owns remembered task metadata and workspace/task-ready subscription lifetimes; no global/native resources, use imported resolveWorkspaceKey(context) whenever identity decision stated. No new IO/subscription protocol.
- rememberTaskMeta replaces by meta.taskId, stores SAME object reference; getTaskMeta returns SAME object or undefined, no clones. Mutating stored meta identity/path later affects clearWorkspace's matching through imported resolver at clear time.
- ensureWorkspaceSubscription: resolve key from passed context, if already registered return false and DON'T invoke subscribe. Otherwise invoke subscribe synchronously, register its returned IDisposable, return true. Throw preserves same error and no registration; reentrant subscribe may call ensure again before outer registration, last successful outer registration wins (no new reservation/hardening). Context isn't persistently copied.
- disposeTaskReadySubscription: absent no-op. Present removes task-ready association BEFORE invoking disposable.dispose() as method; original error identity propagates; repeated call no extra disposal.
- trackTaskReady calls subscribe(listener) BEFORE replacing any existing task-ready association. Listener marks current subscription as already ready; removes/disposes whatever current association belongs to this taskId THEN invokes onReady() free function, even if repeated listener events; no once guard. If subscribe emits listener synchronously before returning, afterwards dispose the newly returned disposable and DON'T register it or invoke context resolver. Listener may remove previous same-task subscription. If dispose/onReady/subscribe throws, preserve order and error identity; no broad swallowing.
- If subscribe returns without synchronous ready, dispose previous same-task ready association BEFORE resolving workspace key/context for new association; then register new returned disposable tied to key. Reentrant old dispose may invoke callbacks; do not reorder or add closed flags. Same taskId across workspace supersedes old association. Return void.
- clearWorkspace: resolve context key. Invoke existing workspace subscription.dispose() BEFORE deleting its association. If it throws, association and metadata/task-ready state remain; later retry may dispose again. After success/delete, traverse remembered task metadata in insertion order, resolving EACH current meta key through imported resolver; delete matching task ids. Then traverse task-ready associations in insertion order; for matching captured key invoke disposeTaskReadySubscription (which removes before disposal). Errors stop traversal immediately, no allSettled/broad cleanup/finally. Other identity sharing same path untouched.
- Public returned property order/signatures exactly catalog; don't require novel private state shapes.

## Body-free public declarations and imports

```ts
import type { IDisposable } from "@knorvia/rpc";

import { resolveWorkspaceKey } from "@knorvia/shared";

interface HostRemoteTaskMeta {
    taskId: string;
    traceId: string;
    workspacePath: string;
    workspaceIdentity?: string;
}

interface HostRemoteWorkspaceContext {
    workspacePath: string;
    workspaceIdentity?: string;
}

export function createHostRemoteWorkspaceProxyState(): {
    rememberTaskMeta: (meta: HostRemoteTaskMeta) => void;
    getTaskMeta: (taskId: string) => HostRemoteTaskMeta | undefined;
    ensureWorkspaceSubscription: (context: HostRemoteWorkspaceContext, subscribe: () => IDisposable) => boolean;
    trackTaskReady: (taskId: string, context: HostRemoteWorkspaceContext, subscribe: (listener: () => void) => IDisposable, onReady: () => void) => void;
    disposeTaskReadySubscription: (taskId: string) => void;
    clearWorkspace: (context: HostRemoteWorkspaceContext) => void;
};
```
