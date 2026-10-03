# Complete owner API and behavior packet

Exact target: packages/shared/src/api-retry-status.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-retry-queue-authored/api-retry-status.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import type { KnorviaApiRetryStatus } from "./task-types-core.js";

export function normalizeKnorviaApiRetryStatus(value: unknown): KnorviaApiRetryStatus | null | undefined;

export function knorviaApiRetryFromModelNetworkStatusPayload(payload: Record<string, unknown>): KnorviaApiRetryStatus | null | undefined;

export function isKnorviaModelRetryRecoveryProgressPayload(payload: Record<string, unknown>): boolean;

export function knorviaApiRetryFromStreamRecoveryPayload(value: unknown): KnorviaApiRetryStatus | undefined;
```

Complete pure retry projection owner. KnorviaApiRetryStatus public type: kind 'api_retry', attempt/maxRetries/retryDelayMs:number,errorStatus:number|null,error:string. Record admission typeof object non-null non-array else {}; normalized value null explicitly returns null, empty own enumerable keys returns undefined (even inherited fields don't make record nonempty). String reader accepts ANY string including empty/whitespace, no trimming. Integer readers accept actual numbers Number.isInteger and positive>0/nonnegative>=0; numeric strings/Infinity/fractions denied.
normalize attempt validpositive attempt otherwise max((positive nextAttempt??2)-1,1); maxRetries max(nonnegative maxRetries??((positive maxAttempts??attempt+1)-1),attempt). delay firstnonnegative retryDelayMs then delayMs then0; errorstatus nonnegativeerrorStatus thenstatusCode thennull; error firststringerror thenmessage thenreason then 'Model retry scheduled'. Return fresh full status.
Network status projection exact payload.type string: model_retry_scheduled ->normalizepayload; model_request_started first streamRecovery projection and if !==undefined return it; otherwise positiveattempt(default1)<=1 returnsnull, normaladapter retry attempt>1 leavesundefined waiting first valid progress; model_request_completed alwaysnull; model_request_failed clearsnull UNLESS retryable===true (truthy string doesn't count); otherwiseundefined. Do not clear ordinary retry merely on next request. Include Chinese compatibility explanation.
Stream recovery acceptsrecordretryNumber positiveint; absent/invalidundefined, else kindapi_retry, attemptretryNumber, maxRetries max(nonnegative field??attempt,attempt), retryDelayMs0,errorStatusnull,error stringmessage??'Model stream recovery retry started'. Do not use adapterattempt. Include Chinese rationale.
Recovery progress kind string: text_delta/reasoning_delta true if delta typeofstring and truthy (whitespace counts,emptyfalse), independent of tool id. Others require truthy stringtoolCallId; tool_input_start/tool_input_end/tool_call true,tool_input_delta requires truthy stringdelta; unknownfalse. No IO or validation additions. Required expression/status vocabulary may recur; no numerical novelty threshold/MIT claim.

No numerical similarity threshold or novelty requirement applies. Report unavoidable contract/public API/import/fixed expression and structure recurrence without reading or comparing inherited source.
