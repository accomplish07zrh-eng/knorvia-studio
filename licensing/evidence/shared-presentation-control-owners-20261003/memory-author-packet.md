# Complete owner API and behavior packet

Exact target: packages/shared/src/memoryDiagnostics.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-memory-next-authored/memoryDiagnostics.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
export type MemorySampleRole = "main" | "renderer" | "utility_host" | "agent_node";

export type MemorySampleWriteReason = "first" | "changed" | "heartbeat";

export interface MemorySampleFields {
    rssKb?: number;
    heapUsedKb?: number;
    heapTotalKb?: number;
    externalKb?: number;
    arrayBuffersKb?: number;
}

export interface MemorySample extends MemorySampleFields {
    role: MemorySampleRole;
    counters: Record<string, number>;
}

export interface MemorySampleWriteGateOptions {
    heapDeltaRatio?: number;
    nativeDeltaRatio?: number;
    heartbeatMs?: number;
}

export interface MemorySampleWriteGate {
    evaluate(sample: MemorySample, nowMs: number): MemorySampleWriteReason | null;
}

export function createMemorySampleWriteGate(options?: MemorySampleWriteGateOptions): MemorySampleWriteGate;

export function bytesToKb(bytes: number): number;

export function memoryUsageToSampleFields(usage: {
    rss?: number;
    heapUsed?: number;
    heapTotal?: number;
    external?: number;
    arrayBuffers?: number;
}): MemorySampleFields;

export function formatMemorySampleLine(sample: MemorySample, reason: MemorySampleWriteReason): string;

export type MemoryDiagnosticsProvider = () => Record<string, number>;

export interface MemoryDiagnosticsRegistry {
    register(name: string, provider: MemoryDiagnosticsProvider): {
        dispose(): void;
    };
    collect(): Record<string, number>;
}

export function createMemoryDiagnosticsRegistry(): MemoryDiagnosticsRegistry;
```

Complete pure diagnostic owner; no actual process/sample/file/timer IO. Exports constants exact numeric values interval60000, heapRatio0.05,nativeRatio0.1,heartbeat300000. Options each use nullish fallback (no validation). Gate owns lastWRITTEN sample and time, initial unset/time0; evaluation caller now explicit. First->first; otherwise heapUsed ratioheap, rss/external rationative changed if BOTH values !==undefined and abs(current-prev)>max(prev,1)*ratio (strict greater); no change for introduced/missing fields, no finiteness guard, ignore heapTotal/arrayBuffers/role differences. Then counters compare union own enumerable keys with strict !==; then now-lastWrite>=heartbeat ->heartbeat; else null. Accepted decision only snapshots shallow {...sample,counters:{...sample.counters}} and time; rejected sample cannot move baseline. NaN counter differs from itself; absent vs present undefined compares equal by current contract. Return reason string/null.
bytesToKb Math.round(bytes/1024), no validation. memoryUsageToSampleFields considers usage rss,heapUsed,heapTotal,external,arrayBuffers only typeof number including nonfinite, maps to suffixed Kb via conversion, omits missing/nonnumber, fresh object.
format line space-joined starts '[memory]', 'role='+role, 'reason='+reason; memory order rssKb,heapUsedKb,heapTotalKb,externalKb,arrayBuffersKb then Object.keys(counters).sort(); only finite number values, Math.round; no escaping/redaction/name validation (caller authoritative).
Registry owns insertion-order name->provider Map. register replaces same name without reorder, returns dispose that deletes ONLY when currently mapped provider is ===registered provider. This is function identity, not registration generation; same function reregister still removable. collect fresh {}, iterate live Map, call providers once, Object.entries their outputs, keep finite numbers only, key name+'.'+key. Entire provider+entry extraction guarded try/catch, skip only failing provider; entries already stored before throw remain. No caller object mutation. JS Map iteration behavior preserved if provider registers/disposes during collect; no defensive snapshot, no async support. Include Chinese reason comment for provider isolation.
