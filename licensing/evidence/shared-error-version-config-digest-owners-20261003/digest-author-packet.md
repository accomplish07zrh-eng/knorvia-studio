# Complete owner API and behavior packet

Exact target: packages/shared/src/workspace-hook-digest.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-digest-config-authored/workspace-hook-digest.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import { createHash } from "node:crypto";

import { basename, relative, resolve } from "node:path";

import { WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION, WORKSPACE_HOOK_EVENT_NAMES, resolveWorkspaceHookConfiguredGates, resolveWorkspaceHookTimeoutMs, type WorkspaceHookConfigFileKind, type WorkspaceHookDefinition, type WorkspaceHookEventName, type WorkspaceHookRuntimeRoot, type WorkspaceHookSourceInput, } from "./workspace-hook-config.js";

export interface CanonicalWorkspaceHookEntryData {
    reviewItemId: string;
    event: WorkspaceHookEventName;
    matcherIndex: number;
    hookIndex: number;
    sourceFileIndex: number;
    sourceRelativePath: string;
    matcher: string | null;
    type: "command" | "process";
    command: string;
    args?: string[];
    async?: boolean;
    shell?: true | string;
    resolvedTimeoutMs: number;
    resolvedMaxOutputBytes: number;
    statusMessage?: string;
    sourceRootEnabled: boolean;
    declarationEnabled: boolean;
    runtimeHooksEnabled: boolean;
    configuredEnabled: boolean;
    editable: boolean;
    declarationDigestAlgorithm: "sha256";
    hookDeclarationDigest: string;
}

export interface WorkspaceHookBundleSnapshotData {
    schemaVersion: typeof WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION;
    workspaceIdentity: string;
    discoveredAt: string;
    sourceFiles: Array<{
        canonicalPath: string;
        baseDir: string;
        discoveryOrder: number;
        configFileKind: WorkspaceHookConfigFileKind;
        explicitProjectConfig: boolean;
        editable: boolean;
        hooksRoot: {
            enabled?: boolean;
            timeoutMs?: number;
            maxOutputBytes?: number;
        };
    }>;
    hooks: CanonicalWorkspaceHookEntryData[];
    digestAlgorithm: "sha256";
    bundleDigest: string;
}

export function resolveWorkspaceHookEntries(input: {
    workspacePath: string;
    sources: readonly WorkspaceHookSourceInput[];
    runtimeRoot: WorkspaceHookRuntimeRoot;
}): CanonicalWorkspaceHookEntryData[];

export function buildWorkspaceHookBundleSnapshot(input: {
    workspaceIdentity: string;
    workspacePath: string;
    sources: readonly WorkspaceHookSourceInput[];
    runtimeRoot: WorkspaceHookRuntimeRoot;
    discoveredAt?: string;
}): WorkspaceHookBundleSnapshotData | undefined;

export function createWorkspaceHookDeclarationDigest(input: {
    sourceRelativePath: string;
    sourceDiscoveryOrder: number;
    event: WorkspaceHookEventName;
    matcher: string | null;
    matcherIndex: number;
    hookIndex: number;
    hook: WorkspaceHookDefinition;
    defaultTimeoutMs: number;
    resolvedMaxOutputBytes: number;
}): string;
```

Complete canonical hook declaration/bundle projection owner through retained pure ports. Type/imports asAPIpacket; no actual hooks/files/trust/config execution or modification. Retainnode crypto createHash algorithm 'sha256',update(JSON.stringify(payload)),digest('hex') port; pathbasename/relative/resolve ports. Public configports schemaVersion literal1, EVENT_NAMES orderedarray (iterateportdirectlynotcopyconstants); gates resolvesource/declaration/runtimeenabled; timeoutresolver(hook,defaultTimeoutMs)->number; author don'treadconfigbodies.
Consumedtypes: source canonicalPath/baseDir:string,discoveryOrder:number,configFileKind:porttype,explicitProjectConfig/editable:boolean,hooks:{enabled?,timeoutMs?,maxOutputBytes?,events?:Partial<Record<event,{matcher?:string,hooks:definition[]}[]>>}; runtimeRoot enabled:boolean,timeoutMs/maxOutputBytes:number. Definition typecommand|process,command:string,enabled?:boolean,statusMessage?:string,timeoutMs?:number; processargs?:string[],commandasync?:boolean,shell?:true|string. Gates result sourceRootEnabled,declarationEnabled,runtimeHooksEnabled,configuredEnabled:boolean. Configtimeouts/gates authoritative, don'treimplementthem.
resolve entries: iterate input.sources.entries in indexorder, EVENT_NAMES portorder, (source.hooks.events?.[event]??[]).entries matcherindex,matcher.hooks.entries hookindex. Normalize relative path: relative(resolve(workspacePath),resolve(sourcePath)).replaceAll('\\','/'); ifempty basename(sourcePath). No workspaceidentity inpath. Computegates withsourceEnabled:source.hooks.enabled,declarationEnabled:hook.enabled,runtimeHooksEnabled:runtimeRoot.enabled; timeout(hook,runtimeRoot.timeoutMs). Common fields exactlyAPI: reviewItemId=`workspace-hook-${sourceFileIndex}-${event}-${matcherIndex}-${hookIndex}`,event,matcherIndex,hookIndex,sourceFileIndex,sourceRelativePath,matcher:matcher.matcher??null,command:hook.command,resolvedTimeoutMs,resolvedMaxOutputBytes:runtimeRoot.maxOutputBytes,statusMessage onlytruthy, ...gates,editable:source.editable,declarationDigestAlgorithm:'sha256',hookDeclarationDigest:publicdigestfunctioninputbelow. Forprocesstypeexactprocess, newentrytypeprocess,args ONLYifprovidedandlength>0 then shallowcopyarray; commandentrytypecommand,async ONLYif===true ->true,shell if!==undefinedincludeevenemptystring; no processasync/shell/commandargs added. Allfresh entries, no mutation/freeze inresolve.
Declaration hashpayload exact orderedtuple:
['workspace-hook-declaration',SCHEMA_VERSION,sourceRelativePath,sourceDiscoveryOrder,event,matcher,matcherIndex,hookIndex,execution,resolvedTimeoutMs,resolvedMaxOutputBytes]. Execution process=['process',hook.command,[...(hook.args??[])]]; command=['command',hook.command,hook.async===true,shellMarker], where shellMarker undefined=>['unset'],true=>['true'],other=>['string',hook.shell] (includingempty). Public createWorkspaceHookDeclarationDigest(input) resolveTimeout(hook,defaultTimeoutMs),thenpayloadhash above; no gates/statusMessage/enabled/editable/workspaceIdentity/path absolute in declarationdigest. Each entrycallsit withnormalizedrelativepath,source.discoveryOrder,event,matcher??null,indices,hook,defaulttimeout,outputlimit.
Buildsnapshot callsresolveentriesfirst; nohooks=>undefined BEFOREmap/hash/clock. sourceFiles fresh array mappingcanonicalPath,baseDir,discoveryOrder,configFileKind,explicitProjectConfig,editable,hooksRoot optional enabled/timeoutMs/maxOutputBytes includediff!==undefined (false/0retained). Bundlehash payload exact ['workspace-hook-bundle',SCHEMA_VERSION,sourceTuples,hookTuples]. Source tuples each [normalizedrelativepath,discoveryOrder,configFileKind,explicitProjectConfig,optionalMarker(enabled),optionalMarker(timeoutMs),optionalMarker(maxOutputBytes)] with undefined['unset'] else['set',value]. Hooktuples each [hookDeclarationDigest,sourceRootEnabled,declarationEnabled,runtimeHooksEnabled,configuredEnabled]. Orderingauthoritative, no sort/dedup. Bundlehash intentionallyexcludesabsolute paths,workspaceIdentity,discoveredAt,editable/statusMessage whereas returned snapshotcarriesAPIfields. Returnfresh snapshot schemaVersion,workspaceIdentity:inputexact,discoveredAt:input.discoveredAt??new Date().toISOString() (emptyaccepted; clockexplicitfixtureinchecks),sourceFiles,hooks,digestAlgorithm:'sha256',bundleDigest.
Deepfreeze snapshot recursively: iftruthytypeofobject AND!Object.isFrozen, freezeobjectFIRST then recurseObject.values; alreadyfrozenobjects stoprecursion (doNOTtraverse nestedfrozenroot), primitivesunchanged. ReturnSAMEvaluegeneric. Fresh processarg copies preventfreezinginputargs; no inputobjectreferencesretained beyondprimitives/types. Unsupported/malformedvalues throw accordingretainedports/arrays, no new validation. Canonicalserialization ordering/tags/markers/formulas/freeze expressionsrecur andarecompatibility constraints, not independentprovenance/MIT.

No numeric similarity threshold/novelty requirement. Complete behavior authoring preserves public data declarations/constants uncounted. Report required expression/structure recurrence honestly without inherited-source comparison.
