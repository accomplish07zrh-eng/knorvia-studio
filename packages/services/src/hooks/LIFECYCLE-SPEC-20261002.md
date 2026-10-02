# Hook settings/discovery/config owner — behavior/API contract

Same PR10/base134e0ff6. Whole hooksService.ts and workspaceHookSettingsModel.ts independently reauthored. hooks.ts unchanged publiccontract/descriptor, workspaceHookConfigMutation.ts unchanged declaration-only reexport to shared mutation authority; skip novelty rewrites. Retain shared workspace discovery/config/digest/trust parser/mutation owner and paths/logger adapters. No shared/dependency source body reads by fresh author. No hook execution, trust grant execution, direct trust-store writes, real config/userfiles/tokens/network/plugininstall. Full behaviors below; own cohesivehelpersallowedinsidehooks each<400nonblank. Ordinary tests/builds skipped; only concrete synthetic config write/permission safety plus scoped types/lint/architecture. No global provenance/licensepolicy changes/no MITclaim.

```text
load → project/user shared discovery → runtime root + canonical snapshot → persistent trust display
     → project → legacy project agents/claude → native user → legacy user agents/claude
save → filter editable local user/current-project declarations → user write → project write
trust grant → optional injected Agent authority (same function); never settings store mutation
```

## Service API and files

createHooksService(options:{logger?:ServiceLogger;grantWorkspaceHookTrust?:NonNullable<IHooksService['grantWorkspaceHookTrust']>}={}):IHooksService. Logger options.logger??createServiceLogger('hooks-service') capturedonce. ReturnloadHooks params=>async implementation(params,logger),saveHooks async implementation directly, optionaltruthy grantWorkspaceHookTrust property is SAME injectedfunction object, no wrapping/cachingnewauthority/executing. Interfaces inhooks.ts allowed declarationreader.
Home trimmedHOME||trimmedUSERPROFILE||homedir. root(source,workspacePath?):base=workspacePath??home; sourceknorvia=>workspacePath truthy?join(base,'.knorvia-studio'):join(getKnorviaDataRootDir(),'cli'); othersjoin(base,sourceagents?'.agents':'.claude'). Configfile root/knorvia'config.json' else'settings.json'. Location source,scope workspacePathtruthy?'project':'user',directoryPath:root,conditionaltruthyprojectPath. Nullish base and truthy scope distinctions retained. Seven recognized HookEvents SessionStart,UserPromptSubmit,PreToolUse,PermissionRequest,PostToolUse,PostToolUseFailure,Stop.
readJson<T>(path): inside try existsSync precheckfalse=>null; readFile UTF8 JSONparse; objectnonnullnotarray=>asT elsenull; ANYerrornull. No malformed config errorhardening. Usernative source: capturegetConfigPathknorvia,awaitreadJsonrecord; workspaceHooksConfigSchema.safeParse(config?.hooks); unsuccessfulundefined; successful return {...createWorkspaceHookSourceInput({path,workingDirectory:livehome,hooks:parsed.data,discoveryOrder:0,explicitProjectConfig:true}),editable:true}. Sharedfactorybodyunchanged.

## Persistent trust read boundary

Readuserconfig JSONor{}; storage=recordconfig.storageor{};configured=typeofstorage.dirstring?trim:'';homecapture. storageRoot configured&& !process.env.KNORVIA_PORTABLE_DIR?.trim()?starts'~/'?join(home,slice2):isAbsolute?resolve(configured):resolve(home,configured):getKnorviaDataRootDir(). trustFile join(root,'security','workspace-hook-trust-v1.json'). AsyncreadUTF8 NO existsSync precheck. CatchonlyErrorinstancewithcodeENOENT =>{digests:newSet,corrupt:false}. Allothererrors loglogger.warn(undefined,'Workspace Hook Trust store 不可读，已 fail-closed 忽略全部持久信任记录',{path:trustFile,error:Error.message elseString(error)});returnemptycorrupttrue. parseWorkspaceHookTrustStoreContent(content) retained sharedparser; statusinvalid loglogger.warn(undefined,'Workspace Hook Trust store 结构不符合 schema，已 fail-closed 忽略全部持久信任记录',{path});returnemptycorrupttrue. Valid: filterrecords EXACT workspaceIdentity equality, map hookDeclarationDigest ->Set; no decision/partialschema shortcuts or trustauthorization inferred. Parser errors outsidecatch propagate. Missing vs corrupt must remain distinguishable; no partialtrust, no execution/trust-policy change.

## Load and save order

load resolve(params.workspacePath),identity=params.workspaceIdentity?.trim()||resolvedpath. Inparallel Promise.all([readWorkspaceHookProjectSources({workingDirectory:resolved}),readUserKnorviaSource()]); useprojectresult.sources, ignoreother fields asold. runtimeRoot=resolveWorkspaceHookRuntimeRoot([userSource?.hooks,...projects.map(source=>source.hooks)]). snapshot=buildWorkspaceHookBundleSnapshot({workspaceIdentity,workspacePath,sources:projectSources,runtimeRoot}). THENawaitpersistenttrust. Hooklist exact order project snapshot conversion; awaitlegacyagentsproject; awaitlegacyclaudeproject; nativeuserconversion(location userknorvia builtlive); awaitlegacyagentsuser;awaitlegacyclaudeuser. Legacyread usesreadJson currentfile and conversion with location built AFTERawait. Returnhooks,hooksEnabled:hooks.some(enabled),conditionalsnapshotpropertyonlyiftruthy,conditionaltrustStoreCorrupt:trueonlyifcorrupt. No queue/observer, no merginglegacyintoexecution.
save currentProjectConfigPath=resolve(params.workspacePath,'.knorvia-studio','config.json'). Userfilter hook.editable!==false AND(!hook.location ORlocation.sourceknorvia&&scopeuser). Projectfilter editable!==false ANDlocationknorvia/project AND(!configuredState ORresolve(configuredState.sourcePath)===currentProjectConfigPath). Excludeancestor/nativeotherfile/legacy/editablefalse. Write USERfirst then PROJECT evenemptyarray. No rollbacksecondfailure, no queue, ignoresworkspaceIdentityforsavepaths.
writeconfig(workspace?,hooks):capture configPath,awaitreadJson<KnorviaConfigFile>??{};enabled=resolveNextRootEnabled(existingConfig.hooks?.enabled,hooks);awaitatomicWriteWorkspaceHookConfig(configPath,{...existingConfig,hooks:{...existingConfig.hooks,...enabled!==undefined?{enabled}:{},events:toKnorviaHooksEvents(hooks)}}). Retain shared atomic writer signature, optionsnone. Preserve otherconfig/hookfields. Malformed existingJSON treatedempty asbaseline; no newsecurity/datarepairrule.

## Settings model complete APIs

Imported types/functions from shared/workspace-hook-discovery, public Hook/configuredstates/locationtypes shared retained. LegacyHookDefinition shape type?:command|process|string,command?:string,args?:string[],async?:boolean,enabled?:boolean,shell?:true|string,statusMessage?:string,timeout?:number,timeoutMs?:number,[key:string]:unknown. LegacyHookMatcher matcher?:string,hooks?:LegacyHookDefinition[]. ExportLegacyHooksConfig hooks?:Partial<Record<string,LegacyHookMatcher[]>>,[key:string]:unknown. Otherpublicsignatures inverified declarationappendix.
Customfields: omit type,command,args,async,enabled,shell,statusMessage,timeout,timeoutMs fromrawviaownenumerable rest; returnundefinedifempty elsecustom. Writable declaration enabled: !configuredState→hook.enabled; else hook.enabled===configuredState.configuredEnabled?configuredState.declarationEnabled:hook.enabled. Writable common {...hook.custom,type:hook.type,command:hook.command,enabled:resolved,truthystatusMessageoptional}. commandaddsasync:trueonlytruthy,shellonlytruthy,timeoutonlytruthy. processaddsargs iffarraypresent&&length>0 (samearrayref),timeoutMs ifftruthytimeout ->seconds\*1000. Do not serialize view trust/configured/provenance fields, don't copylegacy processasync/shell extras (those are omitted fromcommon).
Rawcanonicalhook source.hooks.events?.[entry.event]?.[entry.matcherIndex]?.hooks[entry.hookIndex]; missingError(`Workspace Hook provenance is incomplete for ${entry.reviewItemId}`). Configuredstate fields sourceRootEnabled,declarationEnabled,runtimeHooksEnabled,configuredEnabled fromentry and sourcePath:source.canonicalPath. Canonical view: idprovided,event,matcher:entry.matcher??undefined(propertypresent),type,command; processargs clone entry.args??[]; commandasync/shell only!==undefined;truthystatusMessage; timeout: (raw.typecommand?raw.timeout:undefined) ?? (raw.timeoutMs!==undefined?Math.round(raw.timeoutMs)/1000:undefined), enabled:entry.configuredEnabled,editable:entry.editable,configuredState, optionalworkspaceHookobject,customfieldpropertypresentpossiblyundefined,location. WorkspaceHookobject orderedconfiguredstate thenreviewItemId,sourceFileIndex thenprovidedworkspacefields overridingif any.
fromProjectSnapshot({sources,snapshot,workspaceIdentity,workspacePath,persistentTrustedDigests?}): !snapshot[]; snapshot.hooks.map insequence, sourcebyentry.sourceFileIndex;missingError(`Workspace Hook source is missing for ${entry.reviewItemId}`). viewid=reviewItemId,locationknorvia/project dirname(source.canonicalPath),projectPathinput;workspacefields identity,bundleDigest:snapshot.bundleDigest,hookDeclarationDigest:entry.hookDeclarationDigest,trustState:persistentSet?.has(digest)?'trusted_persistent':'pending_trust'. No executionadmission/partialtrust.
fromUserKnorviaSource({source,runtimeRoot,workspacePath,location}): !source[];resolveWorkspaceHookEntries({workspacePath,sources:[source],runtimeRoot}) retained function; mapentryindex viewid `hook-knorvia-user-${index}`,locationprovided,NOworkspaceHookmetadata. Sameconfiguredstate/rawconvert.
fromLegacyHooksConfig({legacyConfig,location,isHookEvent}): iterateObject.entries(legacyConfig?.hooks??{}); eventvalidpredicateANDArray.isArray(matchers); foreachmatcher,eachmatcher.hooks??[];validtypeexactcommand/process ANDtruthycommandelse skip. Counteronlyacceptedstart0,viewid `hook-${location.source}-${location.scope}-${counter++}`,event,matcherpropertypresentundefinedallowed,type,command,processargs hook.args??[] SAMEref; async/shell iff!==undefined forEITHERtype;truthystatusMessage;timeout=hook.timeout??(timeoutMs!==undefined?Math.round(timeoutMs/1000):undefined);enabled:false,editable:false,location SAMEobject; no custom/configured/workspacefields. Errornaturalmalformed values propagate unchanged, do not filterextra.
toKnorviaHooksEvents(hooks):new ordinaryevents{}; perhookinputorder eventMatchers=events[event]??[];findfirst matcherexactequalhook.matcher; ifnoneconstruct{...(hook.matcher?{matcher}:{}),hooks:[]},push,assignevents[event]=array; thenpushwritableview. False/empty/undefined matcher distinctions are intentionally preserved by exact find vs truthyserialization; do not normalize. No sorting.
resolveNextRootEnabled(existingEnabled,hooks): ifany hook.enabled AND(!configuredState ORhook.enabled!==configuredState.configuredEnabled) returntrue elseexistingEnabled (couldundefined). Never automatically disable root; preserve originally disabled declarations whenviewstate unchanged.

## Acceptance/provenance

One synthetic config safety check before/after: save preserveunrelatedfields/customhooks/options; maintainroot/declaration flags whendisabledviewunchanged; toggle emitsroottrue; legacy noneditable/currentfile filter; malformedtrustfailclosed display; grant callback identityonly (notexecute). Fixturehome/data/workspace/trustfile ALLsynthetic; no actualhook runs/shared trust mutations. Ordinary suites/builds, live permissions/runtimeapproval and platform tests deferred. Curator source-exposed, fresh author gets behavior/API/type only; shared security/discovery/mutation expression retained, parentclassification required.

## Verified declaration-only settings-model appendix

```ts
import { dirname } from "node:path";

import type {
  Hook,
  HookConfiguredState,
  HookEvent,
  SettingsDirectoryLocation,
  WorkspaceHookDiscoveryState,
} from "@knorvia/shared";

import {
  resolveWorkspaceHookEntries,
  type CanonicalWorkspaceHookEntryData,
  type WorkspaceHookBundleSnapshotData,
  type WorkspaceHookDefinition,
  type WorkspaceHookRuntimeRoot,
  type WorkspaceHookSourceInput,
  type WorkspaceHooksConfig,
} from "@knorvia/shared/workspace-hook-discovery";

interface LegacyHookDefinition {
  type?: "command" | "process" | string;
  command?: string;
  args?: string[];
  async?: boolean;
  enabled?: boolean;
  shell?: true | string;
  statusMessage?: string;
  timeout?: number;
  timeoutMs?: number;
  [key: string]: unknown;
}

interface LegacyHookMatcher {
  matcher?: string;
  hooks?: LegacyHookDefinition[];
}

export interface LegacyHooksConfig {
  hooks?: Partial<Record<string, LegacyHookMatcher[]>>;
  [key: string]: unknown;
}

export function fromProjectSnapshot(input: {
  sources: WorkspaceHookSourceInput[];
  snapshot: WorkspaceHookBundleSnapshotData | undefined;
  workspaceIdentity: string;
  workspacePath: string;
  persistentTrustedDigests?: ReadonlySet<string>;
}): Hook[];

export function fromUserKnorviaSource(input: {
  source: WorkspaceHookSourceInput | undefined;
  runtimeRoot: WorkspaceHookRuntimeRoot;
  workspacePath: string;
  location: SettingsDirectoryLocation;
}): Hook[];

export function fromLegacyHooksConfig(input: {
  legacyConfig: LegacyHooksConfig | null;
  location: SettingsDirectoryLocation;
  isHookEvent: (value: string) => value is HookEvent;
}): Hook[];

export function toKnorviaHooksEvents(hooks: Hook[]): WorkspaceHooksConfig["events"];

export function resolveNextRootEnabled(
  existingEnabled: boolean | undefined,
  hooks: Hook[],
): boolean | undefined;
```

## Retained shared declaration-only appendix

### packages/shared/src/workspace-hook-config.ts

```ts
import { existsSync, statSync } from "node:fs";

import { access, readFile, stat } from "node:fs/promises";

import { basename, dirname, join, resolve } from "node:path";

import { z } from "zod";

export type WorkspaceHookEventName = (typeof WORKSPACE_HOOK_EVENT_NAMES)[number];

export type WorkspaceHookConfigFileKind =
  | "knorvia.json"
  | ".knorvia-studio/config.json"
  | "explicit";

export type WorkspaceHookDefinition =
  | z.infer<typeof workspaceHookCommandConfigSchema>
  | z.infer<typeof workspaceHookProcessConfigSchema>;

export type WorkspaceHooksConfig = z.infer<typeof workspaceHooksConfigSchema>;

export interface WorkspaceHookSourceInput {
  canonicalPath: string;
  baseDir: string;
  discoveryOrder: number;
  configFileKind: WorkspaceHookConfigFileKind;
  explicitProjectConfig: boolean;
  editable: boolean;
  hooks: WorkspaceHooksConfig;
}

export interface WorkspaceHookRuntimeRoot {
  enabled: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface WorkspaceHookConfigPathRef {
  path: string;
  explicitProjectConfig: boolean;
}

export interface WorkspaceHookSourceReadError {
  path: string;
  error: unknown;
}

export function resolveWorkspaceHookTimeoutMs(
  hook: Pick<WorkspaceHookDefinition, "type" | "timeoutMs"> & { timeout?: number },
  defaultTimeoutMs: number,
): number;

export function resolveWorkspaceHookMaxOutputBytes(maxOutputBytes: number): number;

export function resolveWorkspaceHookRuntimeRoot(
  roots: readonly (
    | Partial<Pick<WorkspaceHooksConfig, "enabled" | "timeoutMs" | "maxOutputBytes">>
    | undefined
  )[],
): WorkspaceHookRuntimeRoot;

export function resolveWorkspaceHookConfiguredGates(input: {
  sourceEnabled?: boolean;
  declarationEnabled?: boolean;
  runtimeHooksEnabled: boolean;
});

export function discoverWorkspaceHookConfigPaths(input: {
  workingDirectory: string;
  explicitProjectConfigPath?: string;
}): WorkspaceHookConfigPathRef[];

export function createWorkspaceHookSourceInput(input: {
  path: string;
  workingDirectory: string;
  hooks: WorkspaceHooksConfig;
  discoveryOrder: number;
  explicitProjectConfig?: boolean;
}): WorkspaceHookSourceInput;

export async function readWorkspaceHookProjectSources(input: {
  workingDirectory: string;
  explicitProjectConfigPath?: string;
}): Promise<{ sources: WorkspaceHookSourceInput[]; errors: WorkspaceHookSourceReadError[] }>;
```

### packages/shared/src/workspace-hook-digest.ts

```ts
import { createHash } from "node:crypto";

import { basename, relative, resolve } from "node:path";

import {
  WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION,
  WORKSPACE_HOOK_EVENT_NAMES,
  resolveWorkspaceHookConfiguredGates,
  resolveWorkspaceHookTimeoutMs,
  type WorkspaceHookConfigFileKind,
  type WorkspaceHookDefinition,
  type WorkspaceHookEventName,
  type WorkspaceHookRuntimeRoot,
  type WorkspaceHookSourceInput,
} from "./workspace-hook-config.js";

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

### packages/shared/src/workspace-hook-discovery.ts

```ts
export * from "./workspace-hook-config.js";

export * from "./workspace-hook-digest.js";
```

### packages/shared/src/workspace-hook-trust-store-file.ts

```ts
import { z } from "zod";

export type WorkspaceHookTrustRecord = z.infer<typeof workspaceHookTrustRecordSchema>;

export type WorkspaceHookTrustStoreFile = z.infer<typeof workspaceHookTrustStoreFileSchema>;

export type WorkspaceHookTrustStoreParseResult =
  | { status: "ok"; file: WorkspaceHookTrustStoreFile }
  | { status: "invalid" };

export function parseWorkspaceHookTrustStoreContent(
  content: string,
): WorkspaceHookTrustStoreParseResult;
```
