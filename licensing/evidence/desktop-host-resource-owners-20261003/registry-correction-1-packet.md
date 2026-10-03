# Fresh complete-owner boundary

User explicitly authorizes this selected G owner. Read ONLY this packet and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No inherited implementations, tests, dependency bodies, git/history, other packets/authors, config/env/network/previous drafts. Curator had selected inherited-source exposure and generated public API/external behavior facts. No predecessor private helper/state/decomposition/body is supplied. Names/types/static vocabulary are constrained contract data, no novelty requirement or credit.

Produce ONE complete TypeScript module with ONE literal heredoc to the stated fresh /tmp path, then SHA256 computation ONLY without reopening. No repo edits, test/execution/format/compile/install/network or actual host/process/browser/SSH/userfile/permission operations. Choose private structure freely. Report exact reads, whole-draft SHA, exports and uncertainty; ask curator for missing public-port facts before guessing. Later corrections require a fresh complete packet and new whole literal file, no previous draft reads/transforms. Shared filesystem access is instruction-limited, not OS clean-room certification.

## Output
/tmp/knorvia-host-registry-author-correction-1.ts
Complete packages/desktop/src/host/windowRemoteConnectionRegistry.ts.

## Public port/data facts
- Imported RemoteTarget is opaque except kind ssh/wsl/docker and WSL optional distro/user strings. SSH identity delegates buildSshRemoteHostKey(target); snapshot/descriptor target delegates stripRemoteTargetSecrets(target) each time, without cloning/filtering yourself. Target and remoteAssets passed unchanged by reference to connect port. Attachment scope includes kind remote/local; remoteSessionId,workspacePath,workspaceIdentity. Existing scope resolution DOES NOT check any generation field; do not add permissions/authority/security gates.
- Keep existing file-local non-runtime directive /* eslint-disable max-lines -- 所有 transport 生命周期共享同一个 registry 状态机，必须原子演进。 */ if whole owner requires it. Static transport/error vocabulary retained, no novelty requirement. No whole-source private topology supplied.
- All described callback/IO resources injected. One window registry owns connection reuse, logical request/session identity, WSL workspace ownership generations and release/idle ordering. Choose private states/tables/helpers freely while keeping external transitions below.

## Connection acquisition and reuse
- Factory wslIdleTtlMs captured once, nullish default60000. Registry begins active, no transport calls until connect. SSH key 'ssh:'+buildSshRemoteHostKey(target). WSL key 'wsl:'+trim(distro) or '<default>' + NUL + trim(user) or '<default>' (each component independently trim || default). Docker key 'docker:dedicated:'+new logical id: always dedicated. No remote assets/credentials in these additional keys. Reuse existing nonretired/nonaborted connection only while connecting/online; reused target/assets are FIRST acquisition's values, connect port not called again. Reuse clears idle timer if present.
- connect async admission: disposed -> Error 窗口 Host 的远程连接 registry 已释放; currently pending requestId duplicate -> Error 远程连接 requestId 重复，requestId=<requestId>. Then createId() logical id, choose/reuse/create transport, then register logical requester. No new ID validation/reservation. Connect port called with {target,remoteAssets,signal:new AbortController().signal}; synchronous port throw before registration propagates raw. Publish transport in connection stats after connect invocation/Promise continuation setup. Promise/deferred port contract.
- Logical record: remoteSessionId,requestId,target same input reference, truthy workspacePath/workspaceIdentity only, generation1, state/source availability online/online if reused connection already online else connecting/offline. Register ownership and request correlation before awaiting transport. Workspace ownership key raw identity?.trim() || raw path; if truthy remember this connection has used key permanently (until connection disposal), not removed when logical session unbound/disposed. Public workspace fields preserve untrimmed truthy originals. Registry snapshots don't expose private connection/cache/release objects.
- Await first race of transport readiness vs per-logical cancellation; then race of workspace preparation vs same cancellation. After both require logical session not cancelled and id still present; otherwise cancellation error. On success mark online/online and return {remoteSessionId,target:strip(input.target),truthy workspacePath/workspaceIdentity,generation}; no requestId/state/availability in descriptor.
- On connect failure, IF current stored logical object is this acquisition remove logical membership/connection owner, set failed/offline. If last owner and Docker, await transport disposal; its error overrides original connection error. SSH/WSL failed logical acquisition isn't automatically idle/disposed here. Rethrow same original otherwise. Finally delete request correlation ONLY if it still belongs to this exact logical acquisition.
- Transport readiness success captures handle. If transport already retired/disposed OR has zero owners, await same memoized transport disposal and return handle; no resurrection, close-listener subscription or status publication. Disposal begun without a handle remains memoized: do not add a second late handle.dispose call after prior disposal settled (retain existing boundary, not a new cleanup fix). Otherwise mark connection online, subscribe handle.onDidClose(listener) if present, THEN mark all current noncancelled logicals online/online. If onDidClose synchronously notifies, continuation still performs these later logical marks; no added guard. Readiness rejection incl subscription/disposal errors: state failed, remove only own current reuse slot, mark each still-found logical failed/offline, remove their sessions and request correlations, clear owners, rethrow identical error. No synthetic close events on connect failure.

## Close, cancellation and disposal
- Observed onDidClose ignored if already disposed/closing. Otherwise connection disconnected, clear idle timer, remove own current reuse slot, for each still-found logical owner mark disconnected/offline then call live onSessionClosed({remoteSessionId,...event}); event fields can override remoteSessionId if supplied dynamically. Errors stop iteration raw. Keep offline logical records and handle; no handle.dispose/cancellation/workspace release caused just by close.
- Transport disposal lifecycle is memoized once a Promise has been assigned. Before invoking handle.dispose, mark disposed/closing, clear timer, abort its controller, call close subscription.dispose(), clear subscription, remove own current reuse slot. Then invoke handle?.dispose() synchronously and Promise.resolve(result).then(()=>undefined). Errors from abort/listener/dispose invocation propagate before memoized promise assignment; do not broaden catch/set memoization first or swallow them. Later call with assigned promise awaits same outcome; no retry. Native handle may not yet exist; prior described late-completion memoization retained.
- cancelConnect synchronous: pending/uncancelled logical only. Mark cancelled, unconditionally remove that request slot/logical id/owner before triggering workspace release. Ignore async release rejection (structured callback still operates). Reject logical cancellation with Error subclass whose name AND constructor name WindowRemoteConnectCancelledError and message 远程连接已取消. If no remaining transport owners: SSH connecting retires own reuse slot BEFORE setting closing/abort, without immediately memoizing disposal (late success can dispose); WSL online schedules idle with reason cancelled-logical-connect; SSH online clears idle but retains ready window cache; otherwise if handle exists fire-and-forget transport disposal, else leave readiness to handle zero-owner completion. No actual authentication/deployment.
- disposeSession async absent no-op. Remove session, its requestId slot (unconditionally), and owner, request WSL release. With no owners: WSL online schedule last-logical-session-disposed; SSH online retain cache/clear timer; other transports await disposal. Then await release.catch(()=>undefined). Do NOT mark/reject cancellation just from disposeSession; pending connect later fails own membership checks. Dispose failure prevents later release-await as existing order.
- Whole registry dispose async memoizes overall Promise once assigned; mark registry disposed, cancel every current pending request in snapshot key order, then collect DISTINCT transports reachable through remaining logicals AND current reuse table, clear logical/request maps, await Promise.all of transport disposals, result void. Does not await detached already-retired late readiness. Callback/disposal invocation throw before overall Promise assigned stays raw, subsequent calls follow original active disposed flag/memoization behavior. No forced allSettled/retries. New connect after disposal rejects; snapshots/stats reflect cleared slots.

## Workspace generations and release barriers (WSL only)
- Logical public generation starts1, bind increments each call. Separately ownership release generations gate WSL resource cleanup; private representation unrestricted. Other transports or missing truthy workspacePath/key prepare immediately ready Promise; membership not inspected on this immediate path until connect's later own check.
- For WSL with path/key, create/update workspace runtime context object with workspacePath and truthy identity. If no OTHER current uncancelled logical owner on same connection/key, increment release generation (initial0 ->1). If other owner exists share generation. Clear any release generation deferred for running tasks on every acquire/bind so a new owner invalidates old not-started cleanup. Capture generation for this logical ownership; mark workspace pending, wait existing release-in-flight or fulfilled Promise.
- After release wait, require same current logical object at id, not cancelled, and current workspace runtime release generation equals this logical's captured generation; else cancellation error. Set ready; rejection sets failed and rethrows same error. Release failure while new acquire waits is fail-closed for that acquire; no automatic retry/new network. A subsequent acquire after completed failing release sees ordinary current state, no permanent poison added.
- Release requested only for WSL with truthy key and captured release generation; skip if other current uncancelled logical owner same transport/key, or runtime generation no longer matches. Positive task count defers captured release generation, no port yet. Otherwise start release only if generation matches, no release running, handle exists, transport online, and options.releaseWorkspace present. If not eligible return existing in-flight promise (if any), no new side effects.
- Starting release clears deferred generation; invoke live options.releaseWorkspace(handle.services,current context) as options method, await its promise. On failure call live onWorkspaceReleaseError(current context at catch time,SAME error) as options method then rethrow; callback error can override original. Finally clear matching in-flight association; delete runtime state if still same release generation, no deferred generation and no live logical owner. Attach a swallowed catch only for detached unhandled-rejection prevention; the original rejecting promise stays available for new-owner barrier. Synchronous release-port throw remains synchronous to caller before promise association, no new swallowing.
- bindWorkspaceContext synchronous method returning readiness Promise; absent -> ordinary Error 未找到远程 logical session，remoteSessionId=<id> thrown synchronously. Capture prior release ownership, update exact path/identity, increment public generation, workspace key identity.trim() || path, remember key, prepare new ownership, THEN if key changed request prior release and suppress async rejection. Same key bind doesn't request old release. Exact Promise returned from preparation, not async wrapper.
- setWorkspaceRunningTaskCount: identity?.trim() || path key; traverse current reuse-table connections only, WSL only and previously remembered key. Positive counts store exact number and clear idle. Nonpositive/NaN deletes count; if deferred release generation exists start release and suppress its async rejection, then schedule idle using last recorded reason. No normalization/clamp/new validation. Detached/offline entries not in reuse table ignored.
- Idle scheduling clears previous timer and updates remembered reason even if not eligible; schedule only WSL non-disposed, zero owners, no count>0. Timer callback clears timer association first, checks still-current connection object/not disposed/zero owners/no running tasks, then fire-and-forget disposal. Delay configuredTTL, no clamp. New owners/busy counts clear timer. Any remembered workspace still busy prevents whole WSL idle disposal.

## Public queries and authority
- Snapshots getSession(id) null if absent, else new object fields remoteSessionId,requestId,target:strip(original target), truthy workspacePath/workspaceIdentity, generation,state,sourceAvailability. list snapshots insertion order. No secret-bearing target copies or cached projection.
- findSessionForWorkspace matches EXACT raw path AND raw identity equality (undefined differs empty). Prefer one online AND availability online among matches. If >1 online OR 0online and >1 total -> Error 远程 workspace scope 匹配到多个 logical session，workspacePath=<path>. A single online wins despite other offline matches; else only/none -> snapshot/null. Does not add workspace-ready gate to this query.
- getStats current reuse-table connection count and logical-session count, including offline logicals not transport slots.
- resolveScopedServices/capabilities are synchronous. Local scope -> ordinary Error 远程连接 registry 不能解析 local attachment scope. Missing session or unavailable state -> Error subclass name AND constructor name WindowRemoteConnectionUnavailableError, message 远程连接当前不可用，remoteSessionId=<id>. First verify exact workspacePath AND raw workspaceIdentity; mismatch -> ordinary Error 远程 attachment scope 与 logical session 不匹配，remoteSessionId=<id>, BEFORE online/readiness check. Available iff logical state online, source online, workspace readiness ready and captured handle exists. Return EXACT services/capabilities reference (undefined capability valid). No generation/permission/connection-state extra gate.
- waitForScopedServices async first checks remote kind and session existence, awaits that session's current workspace readiness, THEN delegates current scoped resolution (so session removal/rebind while awaiting is observed). No wait of transport readiness directly/no added scope mismatch check before wait; raw release/readiness failure preserved.

## Body-free public declarations and imports

```ts
import { buildSshRemoteHostKey, stripRemoteTargetSecrets, type RemoteTarget, type WindowHostAttachmentScope, type WindowHostRemoteWorkspaceDescriptor, } from "@knorvia/shared";

interface WindowRemoteAssetDirs {
    mockCdnDir?: string;
    remoteCdnBaseUrl?: string;
    remoteCdnBaseUrls?: string[];
    remoteCacheDir?: string;
}

export interface WindowRemoteConnectionCloseEvent {
    exitCode: number | null;
    signal: string | null;
    error?: string;
}

export interface WindowRemoteConnectionHandle<TServices, TCapabilities = never> {
    services: TServices;
    capabilities?: TCapabilities;
    dispose(): void | Promise<void>;
    onDidClose?(listener: (event: WindowRemoteConnectionCloseEvent) => void): {
        dispose(): void;
    };
}

interface WindowRemoteConnectionConnectRequest {
    target: RemoteTarget;
    remoteAssets: WindowRemoteAssetDirs;
    signal: AbortSignal;
}

type WindowRemoteConnectionState = "connecting" | "online" | "closing" | "failed" | "disconnected";

interface WindowRemoteLogicalSessionSnapshot {
    remoteSessionId: string;
    requestId: string;
    target: RemoteTarget;
    workspacePath?: string;
    workspaceIdentity?: string;
    generation: number;
    state: WindowRemoteConnectionState;
    sourceAvailability: "online" | "offline";
}

interface RemoteWorkspaceContext {
    workspacePath: string;
    workspaceIdentity?: string;
}

export function createWindowRemoteConnectionRegistry<TServices, TCapabilities = never>(options: {
    connect: (request: WindowRemoteConnectionConnectRequest) => Promise<WindowRemoteConnectionHandle<TServices, TCapabilities>>;
    createId: () => string;
    onSessionClosed?: (event: WindowRemoteConnectionCloseEvent & {
        remoteSessionId: string;
    }) => void;
    releaseWorkspace?: (services: TServices, context: RemoteWorkspaceContext) => Promise<void>;
    onWorkspaceReleaseError?: (context: RemoteWorkspaceContext, error: unknown) => void;
    wslIdleTtlMs?: number;
});

// Inferred public return surface, body-free callable declarations in original public property order:

function connect(params: {
    requestId: string;
    target: RemoteTarget;
    remoteAssets: WindowRemoteAssetDirs;
    workspacePath?: string;
    workspaceIdentity?: string;
}): Promise<WindowHostRemoteWorkspaceDescriptor>;

function cancelConnect(requestId: string): void;

function bindWorkspaceContext(params: {
    remoteSessionId: string;
    workspacePath: string;
    workspaceIdentity: string;
}): Promise<void>;

function resolveScopedServices(scope: WindowHostAttachmentScope): TServices;

function resolveScopedCapabilities(scope: WindowHostAttachmentScope): TCapabilities | undefined;

function getSession(remoteSessionId: string): WindowRemoteLogicalSessionSnapshot | null;

function listSessions(): WindowRemoteLogicalSessionSnapshot[];

function findSessionForWorkspace(params: {
    workspacePath: string;
    workspaceIdentity?: string;
}): WindowRemoteLogicalSessionSnapshot | null;

function getStats(): {
    connectionCount: number;
    logicalSessionCount: number;
};

function setWorkspaceRunningTaskCount(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    runningTaskCount: number;
}): void;

function waitForScopedServices(scope: WindowHostAttachmentScope): Promise<TServices>;

function disposeSession(remoteSessionId: string): Promise<void>;

function dispose(): Promise<void>;
```


## Complete correction1: additional exact public behavior facts
Produce a new WHOLE literal module, never read/transform/reopen previous draft files. This packet fully repeats the public contract. Retain your own authoring conversation only; no inherited/private source or tests supplied. Earlier clarification messages are authoritative: preparation starts only after transport race success, both entry/registry disposal async, disposed flag alone does not short-circuit retry, detached transport disposal has NO swallowed catch.

Focused strict synthetic public-port owner checking found five local key errors: public setWorkspaceRunningTaskCount has required string workspacePath, so its resolved key is a string (possibly empty), without a new runtime validation/guard. Preserve that required-path inference while optional-path acquisitions may resolve undefined. Synthetic checker baseline has0 errors; initial registry5. This is not imported-product type certification.

Focused rapid WSL same-session rebinding: two synchronous bind calls before promise continuations, same new path/identity, public generation increments each time; BOTH readiness Promises succeed against latest ownership state. Initial candidate cancels earlier Promise. At continuation, compare CURRENT workspace runtime's generation to the SAME CURRENT logical session's LIVE stored ownership generation, not an immutable per-call closure generation. Also retain current runtime existence check, so deleted/replaced ownership runtime is observed. No extra bind-generation authority gate.

Exact authority/admission: scope kind must be remote; all other kinds get existing local-scope error in both synchronous resolve and async wait. After connect's two races, guard is cancelled flag or ID absence; existence is sufficient even if ID currently belongs to a different object. Do not impose a new exact-object comparison there. Existing exact-object checks for catch cleanup, finally request deletion and WSL readiness remain.

Public lifecycle boundaries clarified from bounded source review:
- Transport reuse excludes disposed as well as aborted and non-connecting/non-online; do not substitute only a distinct retirement boolean.
- Other-workspace-owner checks consider ALL current registered uncancelled logical sessions on same transport/key, excluding the caller's remoteSessionId, not only a transport's ownership ID set. Current logical object at that ID is authoritative. Deferred-release completion deletion likewise checks all current logicals.
- WSL ownership release requests require TRUTHY stored generation. Concurrent first logical acquisitions can share generation0 and no workspace release is requested for that generation. This existing boundary must remain, not a cleanup improvement. Pending deferred generation absence/deletion eligibility follows existing truthiness.
- Immediate preparation for non-WSL or missing path/key sets ready and replaces readiness with fulfilled Promise, while leaving any earlier stored WSL ownership generation unchanged. An empty-path bind retaining same identity can later dispose and release the prior owned runtime.
- Docker disposal on failed connect is inside exact-current-logical cleanup branch; initial placement was correct. Do not move outside when transport failure already removed membership.
- Clearing idle timer returns without clearing association for a falsy handle; retain exact boundary.

Public/private helper layout, getter/trap reflection and native ports are not being supplied or certified. Whole corrections still earn no independence/MIT acceptance. No forced novelty.
