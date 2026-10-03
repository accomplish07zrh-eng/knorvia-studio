# Complete owner API and behavior packet

Exact target: packages/shared/src/network-debug-status.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-debug-queue-authored/network-debug-status.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import type { InputId, QueryId, TraceId, KnorviaStreamEvent, KnorviaTaskNetworkDebugStatusType, } from "./task-types-core.js";

export function knorviaTaskNetworkDebugStatusFromPayload(params: {
    taskId: string;
    traceId: TraceId;
    inputId?: InputId;
    queryId?: QueryId;
    eventId?: string;
    payload: Record<string, unknown>;
}): Extract<KnorviaStreamEvent, {
    type: "task_network_debug_status";
}> | null;
```

Complete pure diagnostic event projection, not native network/status collection/logging. Taskcore type imports retained. Recognized payload.type EXACT strings model_request_started,model_request_completed,model_request_failed,model_retry_scheduled,model_stream_stalled; unrecognizednull BEFOREreadingremaining fields. Strings actual stringlength>0 (whitespaceaccepted,nottrim); integer actualnumberinteger positive or>=0 asfield; duration actual finite>=0 (fractionaccepted); boolactualboolean. Record actualobjectnon-nullnon-arrayelse{}, no prototypeguard.
Always return type:'task_network_debug_status',taskId/traceId unchanged,statusType,eventKey,requestHeaders/responseHeaders,requestHeaderCount/responseHeaderCount. Headers fresh plain Record via Object.fromEntries ownObject.entries filtered ONLYtypeofvalue==='string' includingempty/whitespace; no value coercion/redaction; don't mutate or copy inherited values. Arrayheaders=>{}. Headercount firstnonnegativeinteger explicitfield else count admittedheaderkeys (0retained).
Query: payload.queryId nonemptystring; resolved=params.queryId??payload.queryId (empty explicitparam blocksfallback then omitted bytruthy test). InputId optionalinclude if truthyparams.inputId; queryId include if truthyresolved. Eventkey params.eventId??[params.traceId,params.inputId??'no-input',statusType,requestId??'no-request',attempt??'no-attempt',timestamp??'no-time'].join(':'); emptyexplicit eventId is valid eventkey='' but eventId field omitted becausefalsy. Noescaping/decode/generation.
Optional fields include nonemptystring requestId,payload.providerKind,transport,baseURL,querySource,reason,message,timestamp; providerId/modelId fromrecordpayload.model. Attempt positiveinteger; maxAttempts,nextAttempt positiveinteger; statusCode nonnegativeinteger; durationMs,delayMs,idleMs,timeoutMs finitenonnegativenumber; retryable actualbool retainedfalse. Noextra fields/raw leaked. Identitytasktrace params retained, model/providerstrings never rewired. Outputtypeannotation Extract<KnorviaStreamEvent,{type:'task_network_debug_status'}>|null same API. Header privacy callerauthority preserved, no new redaction/hardening/licenceclaims. Required fixedvocabulary/predicates/templates recur.

No numerical similarity threshold or novelty requirement applies. Report unavoidable contract/public API/import/fixed expression and structure recurrence without reading or comparing inherited source.
