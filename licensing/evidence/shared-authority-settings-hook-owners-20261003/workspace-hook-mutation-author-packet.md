# workspace-hook-mutation owner packet

You are a fresh complete-owner author with no inherited context. Author ONLY the named allocated shared source file. Use GPT-6.1 Sol/high as selected. Read EXACTLY this packet plus cat /workspace/knorvia-studio/AGENTS.md and cat /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect other source/tests/dependencies/history/config/environment/network/other authors/output bodies. No runtime/format/check/repository write. Fixed declaration material below includes retained schema/static-map callbacks, not substantive owner bodies or independent credit; preserve it without cosmetic rewriting. Full substantive behavior bodies must be supplied from the contract. Preserve API/dependency identity. No policy widening. Write ONE WHOLE literal heredoc or apply_patch to the designated /tmp output (no file assembly/extraction/transform, no self-inspection). Then sha256sum that output ONLY. Report hash, exact reads/write method and any access deviations. Shared filesystem is not OS isolation; do not claim independent provenance/MIT. Stop for curator freeze/review. User overrides repo broad checks and forbids live operations; you must not run any checks except SHA metadata.

Output: /tmp/knorvia-authority-workspace-hook-mutation-authored.ts

Behavior:
Complete reviewed toggle/write owner; no actual FS/settings/hookoperation. Retain declarations/imports/errorpublicshape; constructor super(message,options), this.name exactlyWorkspaceHookMutationError, readonly parameterproperty code generated. No newerror translation: codes remain unions but owneruses snapshot_mismatch and config_unreadable only. Helpers mismatch constructs exactcode/message, getParsedDeclaration accepts any truthyobject inclarray (typeassertonly), recordhelper objectnonnull/notarray.
Atomic write computes dirname then awaitmkdir(recursive:true) OUTSIDEtry, then resolve(directory, tempname .basename.pid.Date.now().Math.random().toString(16).slice(2).tmp). Serialization happens AFTERawaitopen(wx,0o600) inside try, writeFile(JSON.stringify(value,null,2)+newline,utf8),awaitsync,awaitclose,sethandleundefined, awaitoptions.beforeRename?.() thenrename(temp,file). Catch closeshandle?.close().catch(()=>undefined) thenrmtemp(force:true).catch(()=>undefined), then throws originalerror, no conversion. beforeRename afterclose mayblockrename. If closefirstthrows handle remainsdefined so cleanupcloseagain. mkdir/tempcalculationfailures are outsidecleanupcatch. Promiseport errors, getter/serializationbeforewrite identity preserved; no stronger security/CAS/retryadmission.
Toggle configPath=resolveinput; find snapshot.hooks first matching reviewItemId then source index. Guard sequential: !entry, !entry.editable, !source?.editable, sourcekind!==.knorvia-studio/config.json, resolve(source.canonicalPath)!==configPath. DenyBEFORE read with mismatch exact 'Workspace Hook toggle target is not the current editable project config'.
ReadJSON try only awaitreadFile(configPath,utf8)+JSON.parse; catchwrap config_unreadable/'Workspace Hook config could not be read'/{cause:original}. Thenrecordroot elsemismatch 'Workspace Hook config root is not an object'; schema.safeParse(raw.hooks) BEFORErawstructureguards; !success mismatch 'Workspace Hook config no longer matches its schema'. Rawhooksrecordguard=> 'Workspace Hook config has no hooks object'; eventsrecord=> 'Workspace Hook config has no events object'; entryeventarray=> 'Workspace Hook event no longer exists'; matcher rawatindex record withhooksarray=> 'Workspace Hook matcher no longer exists'; rawhookrecord=> 'Workspace Hook declaration no longer exists'; parseddeclaration via parsedHooks.data.events?.[event]?.[index]?.hooks[hookIndex] truthyobject=>else 'Workspace Hook declaration no longer matches its schema'.
Recompute declaration digest AFTERguards with sourceRelativePath entryvalue,sourceDiscoveryOrder sourcevalue,evententry,matcher parsed currentmatcher??null,matcherIndex/hookIndexentry,hook parseddeclaration,defaultTimeoutMs entry.resolvedTimeoutMs,resolvedMaxOutputBytes entry.resolvedMaxOutputBytes. Compare exact digestentry; mismatch 'Workspace Hook declaration changed after review'. Intentionally entry REVIEWdefaults, NOT disk root defaults; existing root-only drift gap preserved, no security redesign. Rawdeclaration.enabled=input.enabled only AFTERmatch; then awaitatomicWrite(configPath,raw,input.writeOptions) outside readcatch; write failures propagate original. Preserve unrelated config/unknown hookfields rawdata and exact JSONpretty trailingnewline.
Known controls review snapshot editable project source and declaration digest, not bundleDigest/CAS; do not invent rechecks or auth grants. Existing beforeRename injection identity/order unchanged. Chinese comments may explain retained errorclassification and rootdefault drift boundary. Required shorthelpers/conventional adapters uncounted, no novelty requirement.

Fixed declarations and body-free named signatures (declarations can be placed around implementations as needed; validation retains original max-lines waiver):
```ts
import { open, mkdir, readFile, rename, rm } from "node:fs/promises";

import { basename, dirname, resolve } from "node:path";

import type { WorkspaceHookBundleSnapshotData } from "./workspace-hook-digest.js";

import { createWorkspaceHookDeclarationDigest } from "./workspace-hook-digest.js";

import { workspaceHooksConfigSchema, type WorkspaceHookDefinition, } from "./workspace-hook-config.js";

export interface AtomicWorkspaceHookConfigWriteOptions {
    beforeRename?: () => void | Promise<void>;
}

export class WorkspaceHookMutationError extends Error {
    constructor(readonly code: "workspace_hooks_snapshot_mismatch" | "workspace_hooks_bundle_changed" | "workspace_hooks_config_unreadable" | "workspace_hooks_config_write_failed", message: string, options?: ErrorOptions);
}

export async function atomicWriteWorkspaceHookConfig(filePath: string, value: Record<string, unknown>, options: AtomicWorkspaceHookConfigWriteOptions = {}): Promise<void>;

export async function writeWorkspaceHookConfiguredToggle(input: {
    configPath: string;
    snapshot: WorkspaceHookBundleSnapshotData;
    reviewItemId: string;
    enabled: boolean;
    writeOptions?: AtomicWorkspaceHookConfigWriteOptions;
}): Promise<void>;

function getParsedDeclaration(value: unknown): WorkspaceHookDefinition | undefined;

function mismatch(message: string): WorkspaceHookMutationError;

function isRecord(value: unknown): value is Record<string, unknown>;
```
