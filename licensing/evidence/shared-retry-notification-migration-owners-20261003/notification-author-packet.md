# Complete owner API and behavior packet

Exact target: packages/shared/src/background-task-notifications.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-notification-queue-authored/background-task-notifications.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import type { KnorviaMessageWithParts } from "./protocol-legacy-types.js";

import { textFromKnorviaMessageParts } from "./protocol-legacy-types.js";

import type { KnorviaStreamEvent } from "./task-types-core.js";

export interface KnorviaBackgroundTaskNotificationInfo {
    error?: string;
    outputFile?: string;
    result?: string;
    status?: string;
    summary?: string;
    taskId?: string;
}

export function parseKnorviaBackgroundTaskNotificationText(text: string | undefined): {
    notification: KnorviaBackgroundTaskNotificationInfo;
    toolUseId: string;
} | null;

export function collectKnorviaBackgroundTaskNotificationsByToolUseId(messages: readonly KnorviaMessageWithParts[]): Map<string, KnorviaBackgroundTaskNotificationInfo>;

export function knorviaBackgroundTaskNotificationToolUpdateStatus(status: string | undefined): Extract<Extract<KnorviaStreamEvent, {
    type: "tool_call_update";
}>["status"], "completed" | "failed" | "stopped">;

export function attachKnorviaBackgroundTaskNotificationToRaw(raw: unknown, notification: KnorviaBackgroundTaskNotificationInfo | undefined): unknown;
```

Complete pure legacy notification parse/collect/status/raw metadata owner. Dependency textFromKnorviaMessageParts accepts parts[] returns concatenated text fields where type==='text' (including ignored text); port stays imported. KnorviaMessageWithParts has info.role and parts; KnorviaStreamEvent tool_call_update.status includes completed/failed/stopped. No transport/permission execution.
Parse text optional: trim entire input; must startsWith EXACT '<task-notification>' (no attribute/alternateprefix); else null. Read FIRST tag occurrence exactcase using RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`,'u'), meaning minimally matched contents across newlines, no XML parser and no mandatory closing outer task-notification. Trim captured body BEFORE decode; blank/absentundefined. Decode global replacements INORDER: &quot;->doublequote, &apos;->singlequote, &lt;-><, &gt;->>, &amp;->&; no numeric/general/caseinsensitive or recursive entity decode. Require truthy decoded tool-use-id or returnnull. ReturntoolUseId plus notification ALWAYS has error,outputFile,result,status,summary,taskId keys evenundefined; tagmapping error/output-file/result/status/summary/task-id respectively. No invented/default status.
Collect iterate orderedmessages: only info.role exactlyuser, retainedtextport thenparse; successful settoolUseId->notification Map, last occurrence value overwrites without moving first ID insertion order. Assistant messages never contribute. No mutation or IO.
Status mapper failed/lost=>failed, stopped/killed=>stopped, allothersincludingundefined/casechanges=>completed; Chinese comment explain killed/stopped mustnotcomplete.
Attach if notification falsy(undefined typed) return SAME raw identity including primitives; otherwise shallow merge into new record, new _meta, new knorvia nesting preserving existing entries and replacing taskNotification with SAME notification ref. Record check objectnon-nullnon-array else{} (no prototype restriction). Primitive/array raw or metadata lose their fields under recordguard. Existing unrelated nested references retained; no mutation/deepclone/redaction.

No numerical similarity threshold or novelty requirement applies. Report unavoidable contract/public API/import/fixed expression and structure recurrence without reading or comparing inherited source.
