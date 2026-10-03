# Complete owner API and behavior packet

Exact target: packages/shared/src/assistant-presentation.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-assistant-next-authored/assistant-presentation.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import { getLatestAssistantContentPart, type KnorviaAssistantMessagePart, } from "./assistant-message-parts.js";

export interface KnorviaAssistantPresentationToolCall {
    toolId: string;
    parentToolUseId?: string | null;
    kind: string;
    title?: string;
    input: unknown;
    status: string;
    output?: unknown;
    error?: string;
    raw?: unknown;
}

export type KnorviaAssistantPresentationBlock = {
    type: "content";
    content: string;
} | {
    type: "thought";
    content: string;
} | {
    type: "tool-call";
    toolCall: KnorviaAssistantPresentationToolCall;
};

export interface KnorviaAssistantPresentation {
    messageParts: KnorviaAssistantMessagePart[];
    blocks: KnorviaAssistantPresentationBlock[];
    latestPart: Extract<KnorviaAssistantPresentationBlock, {
        type: "content";
    }> | null;
    historyBlocks: KnorviaAssistantPresentationBlock[];
}

export interface BuildKnorviaAssistantPresentationOptions {
    content: string;
    thought?: string;
    toolCalls?: readonly KnorviaAssistantPresentationToolCall[];
    parts?: readonly KnorviaAssistantMessagePart[];
    streaming?: boolean;
    interrupted?: boolean;
    settling?: boolean;
}

export function buildKnorviaAssistantPresentation({ content, thought, toolCalls = [], parts, streaming = false, interrupted = false, settling = false, }: BuildKnorviaAssistantPresentationOptions): KnorviaAssistantPresentation;
```

Dependency public port: KnorviaAssistantMessagePart is content/thought with content:string, or tool-call with toolId:string. getLatestAssistantContentPart(readonly parts) returns last content part by reverse scan, including empty content, or null. Do not inline it.
Options destructured defaults: toolCalls=[], streaming=false, interrupted=false, settling=false; thought/parts optional. If nonempty parts provided, copy outer array and retain original part references. Otherwise derive fallback parts in order: truthy thought, root tool calls in supplied order, truthy content. Root is parent absent/falsy, parent equals own id, or parent ID not present anywhere in all tool calls. Empty parent is falsy. Fallback tool parts carry only type and toolId. Build ID lookup with last duplicate winning. Render content/thought into fresh blocks including empty strings. Render tool part only when lookup exists, not yet rendered, and root predicate holds against ID lookup; suppress children of an existing different parent. Remember tool ID only when rendered; tool-call block retains actual original toolCall object reference. No mutation/dedup of messageParts. In settled mode (none of streaming/interrupted/settling), call retained latest-content port on content-only block values (new type/content parts), then choose LAST matching content block by exact string; latestPart is block reference or null. While any flag true latestPart=null. historyBlocks includes all blocks except selected index, in order; no latest means whole blocks. Preserve tool self-parent and orphan behaviors. Return messageParts,blocks,latestPart,historyBlocks always.
