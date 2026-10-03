# Fresh complete-owner author boundary

You are a fresh internal author in user-authorized G lane. Read only THIS packet, /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect any inherited implementation, tests, dependencies, git/history, specs, config/env, other packets/authors, network or existing drafts. The curator is source-exposed and generated this public API/external behavior contract. No private predecessor helper/state/decomposition/body is supplied. Public names/types/static bindings are compatibility constraints, no novelty requirement or credit. Shared filesystem and instruction-only access limit are not an OS clean room.

Author ONE COMPLETE TypeScript module. Do not execute, format, compile, test, install, or edit repository files. Use ONE literal heredoc to the specified new /tmp draft path, then compute SHA256 only without reopening the draft. Report SHA, intended exports, exact reads, limits and any uncertainties. Correction if requested must be a new complete literal draft using a fresh packet, not reading or transforming an earlier draft. Choose your own private structure/state/helpers. Preserve all described behavior, temporal observation, return/error/object identity and dependency injection. No security changes, real browser/process/files/network/provider/credential/settings/permission operation. Preserve current imports/public signatures. Whole draft will be frozen before curator reads or installs it.

## Output
/tmp/knorvia-host-browser-author.ts
Complete packages/desktop/src/host/browserControlMainBridge.ts.

## Behavioral contract
- Factory creates one opaque backend authority: id starts iab: plus randomUUID; generation is Date.now at construction. list is async, returns a new array containing SAME descriptor object on every call. Captured id/generation are immutable for admission even if caller mutates descriptor. Public descriptor fields: type iab, name Knorvia Studio In-app Browser; metadata.provider knorvia-desktop-iab; capabilities.tab empty. capabilities.browser contains ONLY visibility, description EXACTLY: Use to show or hide the browser to the user, and to determine the browser's current visibility. Keep browser work in the background unless the user asks to see it or live viewing is useful. When the browser should be visible, call set(true). apiSupportOverrides true entries in this order: BrowserUser.claimTab, Tabs.finalize, Tab.markDeliverable, Tab.markHandoff, BrowserRecordingAPI.start, BrowserRecordingAPI.status, BrowserRecordingAPI.cancel. No other optional capabilities.
- Execute is async. A truthy requested browserId unequal captured id returns ok:false/error.code backend_unavailable/message browser backend '<requested>' is no longer available/elapsedMs0. Generation provided (not undefined) unequal captured generation returns backend_unavailable/message browser backend '<captured>' generation <requested> is stale/elapsedMs0. Authority checked before request id generation. Empty browserId is ignored. Defaults only for undefined: workspaceKey=sessionId, workspacePath=workspaceKey, clientMode desktop-continuous, sessionContext live. All optional transport fields turnId/workspaceIdentity/remoteSessionId remain explicit keys with incoming values. Request command forwarded by identity.
- requestId uses supplied value unless nullish, then randomUUID. A running duplicate id returns ok:false/error duplicate_request_id/message browser requestId '<id>' is already running/sideEffect none/elapsedMs0 without posting/timer or disturbing original request. Each request records start Date.now and owns its lifetime; completion/timeouts/dispose act only on the current corresponding entry. Register before synchronous post (allows synchronous fake result). Timeout configured deps.timeoutMs nullish default30000. playwrightWaitForTimeout uses command.timeoutMs+2000; playwright action uses ('timeoutMs' in action ? action.timeoutMs nullish configured : configured)+2000; other methods configured. Do not clamp values. Public command shape methods include action.name/action.operation/action.timeoutMs, timeoutMs, recordingStatus.outputPath.
- Post exact BrowserExecuteRequest type plus requestId,captured browserId/browserGeneration,sessionId,turnId,workspaceKey,workspacePath,workspaceIdentity,remoteSessionId,clientMode,sessionContext,command. Transport post throw clears own timer/removes current correlation, resolves backend_unavailable with Error.message else String(error), elapsed Date.now-start, no sideEffect key.
- Own timeout removes pending BEFORE cancel post; send one cancelRequest command with original requestId using fresh randomUUID as cancel message requestId and same captured authority/request scope. Ignore cancellation transport throw, settle timeout: error code timeout, message browser 命令 <method> 超时（<budget>ms）, sideEffect uncertain only for potentially mutating commands else none, elapsed Date.now-start.
- Mutating public method catalog: navigate,back,forward,reload,click,fill,type,press,cuaKeypress,scroll,cuaScroll,domCuaScroll,hover,select,check,drag,cuaDrag,recordingStart,recordingCancel,handleDialog,close,finalize,newTab. For playwright locator action ONLY operations click,dblclick,downloadMedia,fill,press,selectOption,setChecked are mutating; other playwright actions fall through to method catalog (none).
- handleResult async. Unknown/late ids ignored without inspecting result. Found request timer cleared and correlation removed BEFORE reading recording/materialization. Reuse id after removal permitted and old asynchronous settlement cannot affect newer request. Direct ordinary result settles SAME result object. Read artifact from result.recording?.artifact. If ok && completed recording && artifact && recorded truthy outputPath, use materializeRecording with SAME artifact,localPath artifact.path,outputPath,captured workspacePath and truthy captured workspaceIdentity/remoteSessionId only. If port absent, settle backend_unavailable message browser recording artifact materialization is unavailable,sideEffect none,elapsedDate.now-start. On materialize failure settle execution_error with Error.message/String,sideEffect none,elapsed. Success returns shallow result/recording copies with materialized artifact (same object returned by port) and other data untouched. If completed recording has artifact but no captured outputPath, strip ONLY artifact using shallow copies even if result.ok false. Otherwise direct result identity.
- Recording outputPath is captured only for recordingStatus with truthy outputPath; truthy identity fields captured, omitted empty values for materialization. Dispose clears timers/removes pending and resolves EVERY current request backend_unavailable/message browser bridge disposed while command was pending/sideEffect uncertain/elapsedDate.now-start. No cancel messages, no permanent closed flag; execute after dispose remains allowed. Subsequent results ignored. Ongoing recording materialization was removed already and continues after dispose.

## Body-free public API and imports

```ts
import { randomUUID } from "node:crypto";

import { HostResponseTypes } from "@knorvia/shared";

import type { BrowserBackendDescriptor, BrowserClientMode, BrowserCommand, BrowserCommandResult, BrowserRecordingArtifact, } from "@knorvia/shared";

interface BrowserExecuteRequestMessage {
    type: typeof HostResponseTypes.BrowserExecuteRequest;
    requestId: string;
    browserId: string;
    browserGeneration: number;
    sessionId: string;
    turnId?: string;
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode: BrowserClientMode;
    sessionContext: "live" | "cached";
    command: BrowserCommand;
}

interface BrowserExecuteResultMessage {
    requestId: string;
    result: BrowserCommandResult;
}

interface BrowserControlMainBridge {
    list(): Promise<BrowserBackendDescriptor[]>;
    execute(input: {
        requestId?: string;
        browserId?: string;
        browserGeneration?: number;
        sessionId: string;
        turnId?: string;
        workspaceKey?: string;
        workspacePath?: string;
        workspaceIdentity?: string;
        remoteSessionId?: string;
        clientMode?: BrowserClientMode;
        sessionContext?: "live" | "cached";
        command: BrowserCommand;
    }): Promise<BrowserCommandResult>;
    handleResult(message: BrowserExecuteResultMessage): Promise<void>;
    dispose(): void;
}

export function createBrowserControlMainBridge(deps: {
    postToMain: (message: BrowserExecuteRequestMessage) => void;
    timeoutMs?: number;
    materializeRecording?(input: {
        artifact: BrowserRecordingArtifact;
        localPath: string;
        outputPath: string;
        workspacePath: string;
        workspaceIdentity?: string;
        remoteSessionId?: string;
    }): Promise<BrowserRecordingArtifact>;
}): BrowserControlMainBridge;
```

## Authoritative correction/public-shape clarification
Write ONE NEW COMPLETE literal draft /tmp/knorvia-host-browser-author-correction-1.ts. Read only this fresh complete packet and two instruction files; no prior draft/repo/dependency/test inspection. Own new implementation structure freely; no body transformations.
- Public error result shape puts sideEffect INSIDE error object, never result root. Applies to duplicate (none), timeout (uncertain/none), dispose (uncertain), missing recording materializer (none), recording materializer failure (none). Exactly {ok:false,error:{code,message,sideEffect},elapsedMs} where specified. Initial fake checks failed error.sideEffect undefined.
- Descriptor capabilities are ARRAYS: browser:[{id:'visibility',description:<exact catalog text>}], tab:[]; not keyed object maps. Preserve public descriptor data/order and no cast to hide shape disagreement. apiSupportOverrides at descriptor root confirmed by body-free public shared schema. No authors are permitted to inspect dependency schema bodies.
- deps.timeoutMs is observed and captured ONCE at factory construction, before authority UUID and Date.now; nullish default30000. Later caller mutation must not change budget. deps.postToMain and deps.materializeRecording stay live method-property accesses at their specified call boundaries.
- Public handleResult successful awaited materialization shall spread THEN-CURRENT message.result and message.result.recording after await, replacing only artifact with port return. The original artifact and request scope provided to the port were captured before await. If caller replaces message.result while awaiting materialization, other final result data comes from the replacement. Don't pin a whole result object through await. Preserve ordinary direct result identity. No permanent closed state or broad cancellation.
- execute call captures input fields/defaults as described at call admission, forwarding explicit optional keys. Important captured browser/generation remain independent from descriptor mutation.

## Second complete draft for external error/ordering boundary
Write ONE NEW COMPLETE literal draft /tmp/knorvia-host-browser-author-correction-2.ts. Read only this complete fresh packet and two instruction files; no prior draft/repository/dependency/test reads. Keep prior behavior/API refinements; structure freely without patching or transforms.

Initial corrected two synthetic cases passed; scoped curator review found a remaining recording input error boundary. Added artifact.path getter failure passes frozen baseline but corrected candidate handleResult rejects; original corresponding execute must instead resolve {ok:false,error:{code:'execution_error',message:<Error.message/String>,sideEffect:'none'},elapsedMs}. Construction/reading of recording materialization input (including artifact.path) belongs WITHIN that caught lifecycle, not outside. Only missing materializer branch has its separate backend_unavailable settlement. Preserve raw artifact/result access errors before this admitted materialization branch as original direct method errors.

Lifecycle ordering public facts: timer allocation succeeds BEFORE request is registered, registration precedes posting. If timer allocation throws, no duplicate correlation remains. Timeout removes own current correlation before cancellation and doesn't call clearTimeout on already firing timer. Generate cancellation UUID BEFORE transport try/catch; only post/cancel transport failure is suppressed, UUID failure is not transformed into timeout result. handleResult clears timer before removing current correlation and before result/recording inspection; dispose removes correlation before clearing timer and settling. Post exception clears timer before conditional own removal and resolves original promise even if already removed (Promise first settlement still wins). Each conditional removal only operates on its own current entry; no obsolete lifetime erases replacement. These are external port/error/ordering contracts, no predecessor private helper body/layout supplied. No extra unique case or broad checks needed; only affected browser pair will rerun.
