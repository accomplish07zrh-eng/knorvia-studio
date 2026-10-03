# Complete owner API and behavior packet

Exact target: packages/shared/src/forceUpdate.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-version-config-authored/forceUpdate.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import type { ForceUpdateConfig } from "./coding-plan-subscription.js";

export interface ForceUpdateRequirement {
    currentVersion: string;
    minimalVersion: string;
}

export function compareSemverVersions(leftVersion: string, rightVersion: string): number | null;

export function resolveForceUpdateRequirement(params: {
    currentVersion: string;
    forceUpdate?: ForceUpdateConfig | null;
}): ForceUpdateRequirement | null;
```

Complete pure semver/minimum-version comparison owner (no actual updates/releases/downloads); ForceUpdateConfig={minimalVersion:string} retained typeport. Parse trim,removeONEleading v case-insensitive (even'v' stringthenemptyinvalid), try standardgrammar before numericmajor-only and major.minor shorthand. Standard regex /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/; minor/patchoptional ONLY through separate digits-only major and major.minor alternatives, no prerelease/build on shorthand. Numericparts Number, leadingzeros/unboundeddigits accepted, nofinite/rangeguard. Prerelease split'.' (empty segments allowed grammar), buildmetadataignored. Caseletters allowedliteral. Empty/invalid=>null. Parsed major/minor/patch compare subtractioninthatorder; anydelta !==0 returndelta>0?1:-1 (includingNaN => -1 if overflow subtraction NaN; retain no newvalidation).
Prerelease none vsnone0;stable(no prerelease)>prerelease; compareentries lefttoright untilmaxlength; missingleft -1,missingright1; bothdigitonlyregex /^\d+$/ use Number subtraction, ifdelta!==0 signelsecontinue; numericvsnonnumeric numericlower; bothnonnumeric localeCompare (not lexicaloperator), nonzerodelta sign; allsame0. No localeoverride/sortorder/newvalidation. compareSemverVersions parsesleftthenright, eitherinvalidnull. Large integer/prerelease and 'alpha..beta' permissiveness retained, no standards hardening. Chinese explanationshorthandcompatibility.
resolveForceUpdateRequirement: minimalVersion=params.forceUpdate?.minimalVersion.trim(); absent/null/blank=>null; comparison current rawversion vs TRIMMEDminimum;invalidcomparison/null OR>=0=>null; elsefresh{currentVersion:params.currentVersion (original untrimmed),minimalVersion (trimmed)}. No prompt/settings/permission/remote action. Requiredregex/numberrules/branch/publicstructurerecur; no noveltyrequirement/provenanceclaim.

No numeric similarity threshold/novelty requirement. Complete behavior authoring preserves public data declarations/constants uncounted. Report required expression/structure recurrence honestly without inherited-source comparison.
