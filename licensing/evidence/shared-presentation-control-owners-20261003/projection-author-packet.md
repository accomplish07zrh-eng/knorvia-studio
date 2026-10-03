# Complete owner API and behavior packet

Exact target: packages/shared/src/tool-projection-memory.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-projection-next-authored/tool-projection-memory.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import type { KnorviaStreamingToolInputState } from "./streaming-tool-input-preview.js";

export interface KnorviaToolProjectionMemory {
    completeToolInputById?: Map<string, unknown>;
    streamingToolInputById?: Map<string, KnorviaStreamingToolInputState>;
    toolNameById?: Map<string, string>;
}

export interface KnorviaToolProjectionMetadata {
    hasInput: boolean;
    input?: unknown;
    toolName?: string;
}

export function createKnorviaToolProjectionMemory(): KnorviaToolProjectionMemory;

export function ensureKnorviaToolProjectionMemory(memory: KnorviaToolProjectionMemory): KnorviaToolProjectionMemory;

export function resolveKnorviaToolProjectionMetadata(payload: Record<string, unknown>, toolId: string, memory: KnorviaToolProjectionMemory): KnorviaToolProjectionMetadata;

export function finalizeKnorviaToolProjectionInput(toolId: string, input: unknown, memory: KnorviaToolProjectionMemory): void;

export function forgetKnorviaToolProjectionMetadata(toolId: string, memory: KnorviaToolProjectionMemory): void;
```

Complete in-memory partial/completed/name metadata owner, no dependency runtime import. Retained streaming type has rawInput:string and optional deltaCount,lastPreviewAt,lastPreviewRawInputLength:number. create returns three distinct new Map instances; ensure mutates passed object by NULLISH initialization of each optional map, retains existing maps and same object return.
Resolve metadata: choose payload.toolName if typeof string && LENGTH>0 (NOT trimmed: whitespace string accepted), otherwise cached name optionalget. If chosen name truthy optionalset into existing name map; NEVER initialize missing map in resolve. Test input presence using `"input" in payload` including inherited field. If present, return hasInput payload.input !==undefined, input key ALWAYS present including undefined, toolName key ALWAYS present including undefined. Presence shadows complete cache even explicit undefined. If absent and complete map .has(toolId), return hasInput:true,input:.get even undefined,toolName. Otherwise return hasInput:false,toolName (no input key). Resolve never sets complete input.
Finalize nullish-initializes ONLY complete map, sets ID->input even undefined. If existing streaming state truthy, mutate SAME state: lastPreviewRawInputLength=rawInput.length (JS UTF16 length), rawInput=''; keep other fields/map entry/name intact. Does not initialize streaming/name map. Forget deletes ID from each EXISTING optional map, no initialization or replacement; retain unrelated entries, no return value. Preserve map,stream-state and input object identity. Existing simple expressions/shape may recur; whole module behavior authoring not provenance acceptance.
