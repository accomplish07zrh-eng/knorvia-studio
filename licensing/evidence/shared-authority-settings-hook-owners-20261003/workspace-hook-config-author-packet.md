# workspace-hook-config owner packet

You are a fresh complete-owner author with no inherited context. Author ONLY the named allocated shared source file. Use GPT-6.1 Sol/high as selected. Read EXACTLY this packet plus cat /workspace/knorvia-studio/AGENTS.md and cat /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect other source/tests/dependencies/history/config/environment/network/other authors/output bodies. No runtime/format/check/repository write. Fixed declaration material below includes retained schema/static-map callbacks, not substantive owner bodies or independent credit; preserve it without cosmetic rewriting. Full substantive behavior bodies must be supplied from the contract. Preserve API/dependency identity. No policy widening. Write ONE WHOLE literal heredoc or apply_patch to the designated /tmp output (no file assembly/extraction/transform, no self-inspection). Then sha256sum that output ONLY. Report hash, exact reads/write method and any access deviations. Shared filesystem is not OS isolation; do not claim independent provenance/MIT. Stop for curator freeze/review. User overrides repo broad checks and forbids live operations; you must not run any checks except SHA metadata.

Output: /tmp/knorvia-authority-workspace-hook-config-authored.ts

Behavior:
Complete discovered config reference/source owner with fixed schemas and short numeric/gate adapters retained uncounted. No native FS or hookexecution. Existing imports/API and all declaration material remain. Numeric timeout resolves hook.timeoutMs nullishfirst; if command andtimeout!==undefined use timeout*1000 else default; Math.max(1,Math.round(value)) NaN unchanged. maxbytes same. Runtime roots nativeforof, skip falsy, enabled startsfalse evertrue iff root.enabled===true (false neverresets), latest definedtimeout/max wins, clampfinal. Gate adapter default true unless exactfalse source/declaration; output keys sourceRootEnabled,declarationEnabled,runtimeHooksEnabled,configuredEnabled ANDall.
Discovery candidates directory-order nativeflatMap [join(dir,knorvia.json),join(dir,.knorvia-studio,config.json)]. Sync startsresolve(input.workingDirectory), getProjectConfigDirectories walks currentupward:pushcurrent then hasmarker, ifmarker=>directories.reverse(), parent===currentbreak; no marker=>[start] rather than fullancestry. Marker join.git, existsSync thenstatSync andacceptstats.isDirectory()||stats.isFile() shortcircuit; anythrow false. Asyncsame walks using stat directly marker, dir||file; anycatch false, retains isNodeError(error,ENOENT) compatibility although bothreturnfalse. AsyncpathExists awaitsaccess, anycatchfalse. Do not touch native home/root/git/config.
Sync candidates filterexistsSync THEN map{path,explicitProjectConfig:false}; unhandled existsSync candidateerror propagates. If input.explicitProjectConfigPath truthy resolve thenexists andpushtrue. Deduplicate at end using resolve(ref.path) Set, first occurrencekept ORIGINALref/path/explicitflag, no reorder; asyncaccess sequential candidates then explicit sequential same dedup; duplicates stilltrigger existencechecks BEFOREdedup. Parent.worktree .git file accepted.
Source creator canonicalPath resolve(input.path), explicitflag exacttrue; configDir dirname; baseDir if basename(configDir)===.knorvia-studio then parent elseconfigdir. Output keyordercanonicalPath,baseDir,discoveryOrder,configFileKind explicitifflagelse knorvia.json ifbasenamecanonicalexactelse .knorvia-studio/config.json,explicitflag,editable,hooks. Editable iff!explicit ANDcanonicalPath===resolve(workingDirectory,.knorvia-studio,config.json). hooks preserves originalreference. Do not add path/root/security rules.
Reader awaits asyncdiscovery OUTSIDEperrefcatch, thensequentialrefs.entries() indexes keep gaps from skip/error. ReadFile utf8 ->JSON.parse unknown; nonrecord orhooks===undefined =>skip; else schema.parse(value.hooks), sourcecreator withpath/workdir/hooks/index/refexplicit. Catchany perref error includingJSON/schema/source resolves =>push{path,error} exacterrorobject; continue. Return{sources,errors}. Nonrecord helper objectnonnull/notarray. Never reject entireread dueonesourceerror or execute commands. Fixedschemas strict root/matchers/events, process/command passthrough retained exactly.

Fixed declarations and body-free named signatures (declarations can be placed around implementations as needed; validation retains original max-lines waiver):
```ts
import { existsSync, statSync } from "node:fs";

import { access, readFile, stat } from "node:fs/promises";

import { basename, dirname, join, resolve } from "node:path";

import { z } from "zod";

export const WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION = 1 as const;

export const DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS = 60000;

export const DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES = 32768;

export const WORKSPACE_HOOK_EVENT_NAMES = [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
] as const;

export type WorkspaceHookEventName = (typeof WORKSPACE_HOOK_EVENT_NAMES)[number];

export type WorkspaceHookConfigFileKind = "knorvia.json" | ".knorvia-studio/config.json" | "explicit";

const positiveNumberSchema = z.number().finite().positive();

export const workspaceHookProcessConfigSchema = z
    .object({
    type: z.literal("process"),
    command: z.string().min(1),
    enabled: z.boolean().optional(),
    args: z.array(z.string()).optional(),
    timeoutMs: positiveNumberSchema.optional(),
    statusMessage: z.string().min(1).optional(),
})
    .passthrough();

export const workspaceHookCommandConfigSchema = z
    .object({
    type: z.literal("command"),
    command: z.string().min(1),
    enabled: z.boolean().optional(),
    async: z.boolean().optional(),
    shell: z.union([z.literal(true), z.string().min(1)]).optional(),
    timeout: positiveNumberSchema.optional(),
    timeoutMs: positiveNumberSchema.optional(),
    statusMessage: z.string().min(1).optional(),
})
    .passthrough();

export const workspaceHookMatcherConfigSchema = z
    .object({
    matcher: z.string().min(1).optional(),
    hooks: z
        .array(z.discriminatedUnion("type", [
        workspaceHookProcessConfigSchema,
        workspaceHookCommandConfigSchema,
    ]))
        .min(1),
})
    .strict();

export const workspaceHooksConfigSchema = z
    .object({
    enabled: z.boolean().optional(),
    timeoutMs: positiveNumberSchema.optional(),
    maxOutputBytes: positiveNumberSchema.optional(),
    events: z
        .object({
        SessionStart: z.array(workspaceHookMatcherConfigSchema).optional(),
        UserPromptSubmit: z.array(workspaceHookMatcherConfigSchema).optional(),
        PreToolUse: z.array(workspaceHookMatcherConfigSchema).optional(),
        PermissionRequest: z.array(workspaceHookMatcherConfigSchema).optional(),
        PostToolUse: z.array(workspaceHookMatcherConfigSchema).optional(),
        PostToolUseFailure: z.array(workspaceHookMatcherConfigSchema).optional(),
        Stop: z.array(workspaceHookMatcherConfigSchema).optional(),
    })
        .strict()
        .optional(),
})
    .strict();

export type WorkspaceHookDefinition = z.infer<typeof workspaceHookCommandConfigSchema> | z.infer<typeof workspaceHookProcessConfigSchema>;

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

export function resolveWorkspaceHookTimeoutMs(hook: Pick<WorkspaceHookDefinition, "type" | "timeoutMs"> & {
    timeout?: number;
}, defaultTimeoutMs: number): number;

export function resolveWorkspaceHookMaxOutputBytes(maxOutputBytes: number): number;

export function resolveWorkspaceHookRuntimeRoot(roots: readonly (Partial<Pick<WorkspaceHooksConfig, "enabled" | "timeoutMs" | "maxOutputBytes">> | undefined)[]): WorkspaceHookRuntimeRoot;

export function resolveWorkspaceHookConfiguredGates(input: {
    sourceEnabled?: boolean;
    declarationEnabled?: boolean;
    runtimeHooksEnabled: boolean;
});

function buildWorkspaceHookCandidatePaths(directories: readonly string[]): string[];

function deduplicateWorkspaceHookConfigRefs(refs: readonly WorkspaceHookConfigPathRef[]): WorkspaceHookConfigPathRef[];

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
}): Promise<{
    sources: WorkspaceHookSourceInput[];
    errors: WorkspaceHookSourceReadError[];
}>;

async function discoverWorkspaceHookConfigPathsAsync(input: {
    workingDirectory: string;
    explicitProjectConfigPath?: string;
}): Promise<WorkspaceHookConfigPathRef[]>;

async function getProjectConfigDirectoriesAsync(start: string): Promise<string[]>;

async function hasWorktreeMarkerAsync(directory: string): Promise<boolean>;

async function pathExists(path: string): Promise<boolean>;

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException;

function getProjectConfigDirectories(start: string): string[];

function hasWorktreeMarker(directory: string): boolean;

function isRecord(value: unknown): value is Record<string, unknown>;
```
