# Complete owner API and behavior packet

Exact target: packages/shared/src/lineChangeStat.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-lines-queue-authored/lineChangeStat.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
export interface LineChangeStat {
    added: number;
    removed: number;
}

export function computeLineChangeStat(beforeContent: string | null, afterContent: string): LineChangeStat;
```

Complete pure line-change calculation owner, no imports/IO. Input beforeContent:string|null afterContent:string, outputfresh{added:number,removed:number}. Logical lines: falsycontent=>[]; else splitONLY'\n', removeONE final empty element if present (terminalnewline isn't an added emptyline); retaininterior blanks and '\r' characters and trailing whitespace. Thus '\n'=>[''], empty=>[], CRLF differsLF. Nevertrim/canonicalize.
Discard shared exactline prefix, then shared exactline suffix constrainedNOTcrossprefix. Let remainingA/B lengths m/n. Ifm0 return{added:n,removed:0}; ifn0 return{added:0,removed:m}. Else if m*n>400000 use conservativefallback{added:n,removed:m}. Exactthreshold strictlygreater, calculatedAFTERcommonprefix/suffixtrim; unchangedhugefilesdon'tfallback. Below/equal threshold count line LCS (case-sensitive strictstring equality), added=n-LCS,removed=m-LCS. Duplicates/order meaningful; algorithm internal arrangement maydiffer without noveltyrequirement. Keep O(n) orbetter memory and bounded O(m*n) computation; don't create fullquadratic matrix above or belowlimit. No newsizecap, exceptions or lexicaldiff heuristics. IncludeChinese rationale forconsistent card/summary truechangedcounts and verylarge fallback toavoidUIstalls. Required LCS/trim/fallback expressions/structurecanrecur and freshauthoringdoesnotestablishMIT.

No numerical similarity threshold or novelty requirement applies. Report unavoidable contract/public API/import/fixed expression and structure recurrence without reading or comparing inherited source.
