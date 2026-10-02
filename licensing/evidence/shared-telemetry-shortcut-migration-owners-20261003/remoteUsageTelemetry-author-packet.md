Fresh internal author: read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No source bodies/tests/deps/history/config/env/other outputs/additional repository reads. User explicitly defers ordinary validation; do NOT run architecture/runtime/tests/typechecks/formatting/network/native operations or write repository. Author entire target file at designated tmp path using whole literal heredoc or apply_patch. Do not inspect/re-read output (sha256sum permitted). Report exact read/write/patch/hash/access limits. Whole draft frozen/hash-bound before curator review. No novelty requirement; exact public declarations/static data below retained uncounted. Curator source-exposed; shared filesystem not OS isolation. No user data/credentials/account/Library/native IO/security actions.

Target packages/shared/src/remoteUsageTelemetry.ts; output /tmp/knorvia-telemetry-remoteUsageTelemetry-authored.ts

Whole low-cardinality scope/result/error projection owner. Retain imports/public types. resolveWorkspaceTelemetryDetail scope.workspaceIdentity?.trim() first; workspace_kind remote if trimmedidentity truthy OR scope.remoteSessionId?.trim() truthy, elselocal. remote_kind only ifidentity truthy then parseRemoteWorkspaceIdentity(identity)?.kind??empty elseempty; unknown nonemptyidentity still remote. Preserve short-circuit remoteSession read when identity truthy, parser errorpropagation/referencevocab, no rawidentity/path/session output. build result exact own key insertion elementName remote_workspace_connect_result,eventRegion remote_workspace,eventType result,eventExtraDetail:{result:input.result,remote_kind:input.remoteKind,connect_trigger:input.connectTrigger,error_category: resultsuccess?empty:input.errorCategory??unknown}; no other user/error fields returned. Errorclassification: string=>lowercase; objectnonnull (arraysallowed) code from inherited-or-own `code in error` then String(value??empty), message similarly `message in error`, concatenate code+' '+message thenlower; nonobjects inclfunctions=>empty. No error recursion/name/stack/textserialization, getter/coercionerrorpropagate. Ordered regex languages: auth first (auth|password|credential|token|permission|denied|unauthor); deploy second (deploy|download|install|asset|checksum); host_start third (host_start|host start|spawn|process.*(?:exit|start)|host.*(?:exit|start)); attachfourth (attach|desktop_host_missing|workspace.*(?:identity|missing|mismatch)|remote_session); relayfifth (relay|websocket|web socket|pair|device.*(?:kicked|not.found)); connectsixth (connect|network|socket|ssh|wsl|docker|server|timeout|timedout|econn); elseunknown. Fixed regexlanguages andvocabulary unchanged, no boundaries/caseflag change (lower first); no actual auth/network/deployaction. Rawsynthetictexts only localmatcher, outputs enums.

Retained API/static declarations (behavior owner bodies removed):
```ts
import type { RemoteTarget } from "./remoteTarget.js";

import type { TelemetryEventPayload } from "./telemetry.js";

import { parseRemoteWorkspaceIdentity, type RemoteWorkspaceIdentityKind, } from "./remote-workspace-identity.js";

export function resolveWorkspaceTelemetryDetail(scope: {
    workspaceIdentity?: string | null;
    remoteSessionId?: string | null;
}): {
    workspace_kind: "local" | "remote";
    remote_kind: RemoteWorkspaceIdentityKind | "";
};

export type RemoteUsageRemoteKind = RemoteTarget["kind"];

export type RemoteUsageWorkspaceKind = "local" | "remote";

export type RemoteUsageResult = "success" | "failure";

export type RemoteWorkspaceConnectTrigger = "new" | "reconnect" | "restore";

export type RemoteUsageErrorCategory = "auth" | "connect" | "deploy" | "host_start" | "attach" | "relay" | "unknown";

export function buildRemoteWorkspaceConnectResultTelemetry(input: {
    result: RemoteUsageResult;
    remoteKind: RemoteUsageRemoteKind;
    connectTrigger: RemoteWorkspaceConnectTrigger;
    errorCategory?: RemoteUsageErrorCategory;
}): TelemetryEventPayload;

export function classifyRemoteUsageError(error: unknown): RemoteUsageErrorCategory;
```
