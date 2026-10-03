# Complete owner API and behavior packet

Exact target: packages/shared/src/errors.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-error-config-authored/errors.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
export interface NormalizedUnknownError {
    message: string;
    code?: string;
}

export function stringifyUnknownValue(value: unknown): string;

export function normalizeUnknownError(error: unknown): NormalizedUnknownError;

export function isKnorviaFileLockTimeoutError(error: unknown): boolean;
```

Complete unknown-error pure normalization owner. Retain constant KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE='KNORVIA_FILE_LOCK_TIMEOUT' as const, publictypes and imports (none). Record test typeofobject nonnull, arrays accepted, no plain-prototypefilter. Candidate unwrap only when input record AND 'error' in input AND input.error record AND nested 'message' OR'code' present (in includesinherited); elseoriginal. Do not recursively unwrap; field presence not truthiness.
stringifyUnknownValue string->same;null->'null';undefined->'undefined';number/bool/bigint->String(value);else tryJSON.stringify, returnserialized if !==undefined, catchserialization exceptionsonly thenString(value). Function/symbol JSONundefined=>String; circularobject Stringfallback; Stringfallbackexceptions propagate, no additional catch.
normalize code typeofstring/number/bigint=>String includingempty/NaN,othersundefined. Ifcandidate instanceof Error incurrentrealm, return ALWAYS message and code keys; messagecandidate.message||candidate.name||String(candidate); codeerror.code reader. Forrecordcandidate code if'code'in thennormalized elseundefined; message if'message'in stringifycandidate.message elsestringifycandidate; if stringmessage==='undefined' ORmessage.length===0 fallbackstringifycandidate; returnmessage/code ALWAYS keys evenundefined. Primitivecandidate returnONLYmessage (no codekey). Stringify requiredfieldsnotredact/clone/mutate; preservewrappederror object data and explicitempty handling, noIO/telemetry. isKnorviaFileLockTimeoutError usesnormalized.code===constant. Chinese comments explains circularJSON exceptions andemptyError.message fallback. Required API/recordguard/catch/precedence/literals recur, notprovenanceacceptance.

No numeric similarity threshold/novelty requirement. Complete behavior authoring preserves public data declarations/constants uncounted. Report required expression/structure recurrence honestly without inherited-source comparison.
