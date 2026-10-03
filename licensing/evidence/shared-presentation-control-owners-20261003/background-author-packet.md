# Complete owner API and behavior packet

Exact target: packages/shared/src/background-task-controls.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-background-next-authored/background-task-controls.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
export type KnorviaBackgroundTaskControlStatus = "pending" | "running" | "completed" | "failed" | "killed" | "lost";

export interface KnorviaBackgroundTaskControlItem {
    jobId: string;
    toolCallId?: string;
    command: string;
    taskKind: "agent" | "bash";
    cancellable?: boolean;
    title?: string;
    status: KnorviaBackgroundTaskControlStatus;
    startedAt?: number;
    elapsedMs?: number;
    pid?: number;
    stdoutTail?: string;
    stderrTail?: string;
    outputTail?: string;
    raw?: unknown;
}

export function resolveKnorviaBackgroundTaskControlKind(value: unknown): BackgroundTaskControlKind | undefined;

export function parseKnorviaBackgroundTaskControlItems(value: unknown): KnorviaBackgroundTaskControlItem[];

export function isActiveKnorviaBackgroundTaskControlItem(job: KnorviaBackgroundTaskControlItem): boolean;

export function getKnorviaBackgroundTaskControlItemElapsedMs(job: KnorviaBackgroundTaskControlItem, now?): number;

export function collectVisibleKnorviaBackgroundTaskControlItems(jobs: readonly KnorviaBackgroundTaskControlItem[], now?, thresholdMs?): Array<KnorviaBackgroundTaskControlItem & {
    elapsedMs: number;
}>;
```

Pure unknown-value legacy normalizer and visible-control owner. Public statuses/types in declarations. No native control execution. Record test: typeof object non-null non-array (not prototype restriction). Field readers iterate exact ordered keys; string reader accepts nonempty TRIMMED strings; number reader finite numbers or nonblank numeric strings via Number, skips nonfinite; boolean reader bool or trimmedlower strings true/yes/1 and false/no/0. Instant reader first does number reader across ALL keys, and only if none then Date.parse nonblank strings across keys; numeric later alias beats earlier ISO date.
Command accepts trimmed nonblank string or array of trimmed string entries (skip nonstrings/blank), joined single spaces; command priority command,cmd,script then input if record same keys. Token normalization trim lower replace all runs outside a-z0-9 with underscore using /[^a-z0-9]+/gu (no trim underscores).
Kind sources priority: explicit taskKind,task_kind,taskType,task_type string reader then token mapping; toolName,tool_name then token mapping with task specially agent; type,kind,category then BACKGROUND-only aliases. Explicit/tool mapping agent|local_agent|subagent|background_agent=>agent; bash|local_bash|shell|terminal|background_bash|background_shell=>bash. Background-type mapping local_agent|subagent|background_agent|agent_background=>agent; local_bash|background_bash|background_shell|bash_background|shell_background=>bash; bare agent/bash/type task NOT recognized in final source. Unrecognized explicit token falls through to next source.
Display command: agent description,summary,title,label then command; bash command then same display aliases. Deny unknown kind or absent display command. Job identity first nonempty string from taskId,task_id,backgroundTaskId,background_task_id,jobId,job_id,backgroundJobId,background_job_id,id (NOT toolCallId); else `background-task:${pid??"no-pid"}:${startedAt??"no-start"}:${command}`. Date aliases startedAt,started_at,startTime,start_time; pid pid,processId,process_id. Additional toolCallId aliases toolCallId,tool_call_id; elapsed elapsedMs,elapsed_ms,durationMs,duration_ms; title title,name,label,description; status status,state,phase; cancellable cancellable; tails stdoutTail,stdout_tail / stderrTail,stderr_tail / outputTail,output_tail. Status token sets pending queued/scheduled/starting/pending; running running/in_progress/started/active; completed completed/complete/success/succeeded/done; failed failed/failure/error/spawn_error; killed killed/cancelled/canceled/stopped/terminated/timed_out/timeout; lost lost/unknown; any other default running. Parse only top-level arrays, skip invalid entries, map by jobId preserving first insertion order with LAST whole job winning. job always jobId,command,taskKind,status,raw (original item reference); optional fields OMIT when undefined, string fields omit falsy; false/0 retained. No shallow passthrough of unknown fields.
Active ONLY running (pending not active). elapsed function default now=Date.now(), elapsed max( startedAt defined ? max(0,now-startedAt):0, elapsedMs??0). No extra finite guards. visible defaults now=Date.now(), thresholdMs=30000; active filter, fresh spread each retained job plus computed elapsedMs, >=threshold, stable descending elapsed. Original jobs/array unmutated. Keep task-id-first compatibility rationale comment (Chinese).
