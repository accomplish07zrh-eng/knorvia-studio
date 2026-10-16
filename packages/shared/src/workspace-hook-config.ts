// SPDX-License-Identifier: Apache-2.0

import { existsSync, statSync } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { z } from "zod";

const SCHEMA_V1 = 1 as const;
export const WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION = SCHEMA_V1;

const SIXTY_SECONDS_MS = 60 * 1000;
const THIRTY_TWO_KIB = 32 * 1024;
export const DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS = SIXTY_SECONDS_MS;
export const DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES = THIRTY_TWO_KIB;

const EVENT_NAME_TEXT =
  "SessionStart,UserPromptSubmit,PreToolUse,PermissionRequest,PostToolUse,PostToolUseFailure,Stop";

type EventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Stop";

export const WORKSPACE_HOOK_EVENT_NAMES = EVENT_NAME_TEXT.split(",") as [EventName, ...EventName[]];

export type WorkspaceHookEventName = EventName;

const KIND_PROJECT = "knorvia.json" as const;
const KIND_STUDIO = ".knorvia-studio/config.json" as const;
const KIND_EXPLICIT = "explicit" as const;
const STUDIO_DIR = ".knorvia-studio";

type ProjectKind = typeof KIND_PROJECT;
type StudioKind = typeof KIND_STUDIO;
type ExplicitKind = typeof KIND_EXPLICIT;
export type WorkspaceHookConfigFileKind = ProjectKind | StudioKind | ExplicitKind;

const finitePositive = z.number().finite().positive();
const commandText = z.string().min(1);
const optionalSwitch = z.boolean().optional();
const optionalNote = commandText.optional();
const optionalArguments = z.array(z.string()).optional();

function kindTag<Kind extends "process" | "command">(kind: Kind) {
  return z.literal(kind);
}

function loose<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).passthrough();
}

function locked<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).strict();
}

function pair<A extends z.ZodType, B extends z.ZodType>(left: A, right: B): [A, B] {
  return [left, right];
}

export const workspaceHookProcessConfigSchema = loose({
  type: kindTag("process"),
  command: commandText,
  enabled: optionalSwitch,
  args: optionalArguments,
  timeoutMs: finitePositive.optional(),
  statusMessage: optionalNote,
});

export const workspaceHookCommandConfigSchema = loose({
  type: kindTag("command"),
  command: commandText,
  enabled: optionalSwitch,
  async: optionalSwitch,
  shell: z.union([z.literal(true), commandText]).optional(),
  timeout: finitePositive.optional(),
  timeoutMs: finitePositive.optional(),
  statusMessage: optionalNote,
});

const definitionPair = pair(workspaceHookProcessConfigSchema, workspaceHookCommandConfigSchema);
const hookDefinition = z.discriminatedUnion("type", definitionPair);

export const workspaceHookMatcherConfigSchema = locked({
  matcher: commandText.optional(),
  hooks: z.array(hookDefinition).min(1),
});

function eventBucket() {
  return z.array(workspaceHookMatcherConfigSchema).optional();
}

export const workspaceHooksConfigSchema = locked({
  enabled: optionalSwitch,
  timeoutMs: finitePositive.optional(),
  maxOutputBytes: finitePositive.optional(),
  events: locked({
    SessionStart: eventBucket(),
    UserPromptSubmit: eventBucket(),
    PreToolUse: eventBucket(),
    PermissionRequest: eventBucket(),
    PostToolUse: eventBucket(),
    PostToolUseFailure: eventBucket(),
    Stop: eventBucket(),
  }).optional(),
});

type ParsedProcess = z.output<typeof workspaceHookProcessConfigSchema>;
type ParsedCommand = z.output<typeof workspaceHookCommandConfigSchema>;
export type WorkspaceHookDefinition = ParsedProcess | ParsedCommand;

export type WorkspaceHooksConfig = z.output<typeof workspaceHooksConfigSchema>;

export type WorkspaceHookSourceInput = Record<"canonicalPath" | "baseDir", string> &
  Record<"discoveryOrder", number> &
  Record<"configFileKind", WorkspaceHookConfigFileKind> &
  Record<"explicitProjectConfig" | "editable", boolean> &
  Record<"hooks", WorkspaceHooksConfig>;

export type WorkspaceHookRuntimeRoot = Record<"enabled", boolean> &
  Record<"timeoutMs" | "maxOutputBytes", number>;

export type WorkspaceHookConfigPathRef = Record<"path", string> &
  Record<"explicitProjectConfig", boolean>;

export type WorkspaceHookSourceReadError = { path: string; error: unknown };

type RootSlice = Partial<Pick<WorkspaceHooksConfig, "enabled" | "timeoutMs" | "maxOutputBytes">>;

type TimeoutHook = Pick<WorkspaceHookDefinition, "type" | "timeoutMs"> & { timeout?: number };

type DiscoverRequest = { workingDirectory: string; explicitProjectConfigPath?: string };

type RootChain = readonly (RootSlice | undefined)[];

const FILE_TAILS = [[KIND_PROJECT], [STUDIO_DIR, "config.json"]] as const;

function atLeastOne(value: number): number {
  const rounded = Math.round(value);
  return rounded < 1 ? 1 : rounded;
}

export function resolveWorkspaceHookTimeoutMs(hook: TimeoutHook, defaultTimeoutMs: number): number {
  const seconds = hook.type === "command" ? hook.timeout : undefined;
  const chosen = hook.timeoutMs ?? (seconds === undefined ? defaultTimeoutMs : seconds * 1000);
  return atLeastOne(chosen);
}

export function resolveWorkspaceHookMaxOutputBytes(limit: number): number {
  return atLeastOne(limit);
}

export function resolveWorkspaceHookRuntimeRoot(chain: RootChain): WorkspaceHookRuntimeRoot {
  const folded = chain.reduce<WorkspaceHookRuntimeRoot>(
    (acc, root) => {
      if (!root) return acc;
      const next: WorkspaceHookRuntimeRoot = {
        enabled: acc.enabled || root.enabled === true,
        timeoutMs: root.timeoutMs ?? acc.timeoutMs,
        maxOutputBytes: root.maxOutputBytes ?? acc.maxOutputBytes,
      };
      return next;
    },
    {
      enabled: false,
      timeoutMs: DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES,
    },
  );
  const clamped: WorkspaceHookRuntimeRoot = {
    enabled: folded.enabled,
    timeoutMs: atLeastOne(folded.timeoutMs),
    maxOutputBytes: atLeastOne(folded.maxOutputBytes),
  };
  return clamped;
}

type GateInput = Partial<Record<"sourceEnabled" | "declarationEnabled", boolean>> &
  Record<"runtimeHooksEnabled", boolean>;

function flagOn(value: boolean | undefined): boolean {
  return value !== false;
}

function gateTuple(
  sourceRootEnabled: boolean,
  declarationEnabled: boolean,
  runtimeHooksEnabled: boolean,
  configuredEnabled: boolean,
) {
  return { sourceRootEnabled, declarationEnabled, runtimeHooksEnabled, configuredEnabled };
}

export function resolveWorkspaceHookConfiguredGates(input: GateInput) {
  const sourceRootEnabled = flagOn(input.sourceEnabled);
  const declarationEnabled = flagOn(input.declarationEnabled);
  // 返回值用第一次读到的运行时开关；与运算再读一次，getter 两次可以不同。
  const reportedRuntime = input.runtimeHooksEnabled;
  const configuredEnabled = sourceRootEnabled && declarationEnabled && input.runtimeHooksEnabled;
  return gateTuple(sourceRootEnabled, declarationEnabled, reportedRuntime, configuredEnabled);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return;
}

function hookFilesUnder(directories: readonly string[]): string[] {
  const paths: string[] = [];
  for (const directory of directories) {
    for (const tail of FILE_TAILS) paths.push(join(directory, ...tail));
  }
  return paths;
}

function uniqueRefs(refs: readonly WorkspaceHookConfigPathRef[]): WorkspaceHookConfigPathRef[] {
  const seen = new Set<string>();
  const kept: WorkspaceHookConfigPathRef[] = [];
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!ref) continue;
    const canonical = resolve(ref.path);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    kept.push(ref);
  }
  return kept;
}

// 一直走到文件系统根都没有 .git 时，候选目录只留起点，不把祖先都算进来。
function soleDirectory(start: string): string[] {
  const only = [start];
  return only;
}

function climb(start: string, marked: (directory: string) => boolean): string[] {
  const visited: string[] = [];
  let cursor = start;
  while (cursor.length > 0) {
    visited.push(cursor);
    if (marked(cursor)) return visited.toReversed();
    const above = dirname(cursor);
    if (above === cursor) return soleDirectory(start);
    cursor = above;
  }
  return soleDirectory(start);
}

async function climbAsync(
  start: string,
  marked: (directory: string) => Promise<boolean>,
): Promise<string[]> {
  const visited: string[] = [];
  let cursor = start;
  while (cursor.length > 0) {
    visited.push(cursor);
    if (await marked(cursor)) return visited.toReversed();
    const above = dirname(cursor);
    if (above === cursor) return soleDirectory(start);
    cursor = above;
  }
  return soleDirectory(start);
}

function gitMarker(directory: string): string {
  return join(directory, ".git");
}

function looksLikeGit(stats: { isDirectory(): boolean; isFile(): boolean }): boolean {
  return stats.isFile() || stats.isDirectory();
}

function directoryHasGit(directory: string): boolean {
  const marker = gitMarker(directory);
  if (!existsSync(marker)) return false;
  try {
    return looksLikeGit(statSync(marker));
  } catch {
    return false;
  }
}

async function directoryHasGitAsync(directory: string): Promise<boolean> {
  const stats = await stat(gitMarker(directory)).catch(() => undefined);
  if (!stats) return false;
  return looksLikeGit(stats);
}

function remember(
  refs: WorkspaceHookConfigPathRef[],
  path: string,
  explicitProjectConfig: boolean,
  present: boolean,
) {
  if (present) refs.push({ path, explicitProjectConfig });
}

function absoluteWorkingDirectory(input: DiscoverRequest): string {
  return resolve(input.workingDirectory);
}

function gatherSync(
  directories: readonly string[],
  explicitPath: string | undefined,
): WorkspaceHookConfigPathRef[] {
  const found: WorkspaceHookConfigPathRef[] = [];
  for (const path of hookFilesUnder(directories)) remember(found, path, false, existsSync(path));
  if (explicitPath !== undefined) {
    const explicit = resolve(explicitPath);
    remember(found, explicit, true, existsSync(explicit));
  }
  return uniqueRefs(found);
}

export function discoverWorkspaceHookConfigPaths(input: DiscoverRequest) {
  const directories = climb(absoluteWorkingDirectory(input), directoryHasGit);
  return gatherSync(directories, input.explicitProjectConfigPath);
}

function kindFor(explicit: boolean, fileName: string): WorkspaceHookConfigFileKind {
  if (explicit) return KIND_EXPLICIT;
  return fileName === KIND_PROJECT ? KIND_PROJECT : KIND_STUDIO;
}

function baseDirFor(canonicalPath: string): string {
  const folder = dirname(canonicalPath);
  return basename(folder) === STUDIO_DIR ? dirname(folder) : folder;
}

function editableProjectFile(workingDirectory: string): string {
  return resolve(workingDirectory, STUDIO_DIR, "config.json");
}

type SourceRequest = Record<"path" | "workingDirectory", string> &
  Record<"hooks", WorkspaceHooksConfig> &
  Record<"discoveryOrder", number> &
  Partial<Record<"explicitProjectConfig", boolean>>;

function sourceRecord(
  canonicalPath: string,
  baseDir: string,
  discoveryOrder: number,
  configFileKind: WorkspaceHookConfigFileKind,
  explicitProjectConfig: boolean,
  editable: boolean,
  hooks: WorkspaceHooksConfig,
): WorkspaceHookSourceInput {
  const row: WorkspaceHookSourceInput = {
    canonicalPath,
    baseDir,
    discoveryOrder,
    configFileKind,
    explicitProjectConfig: explicitProjectConfig,
    editable,
    hooks: hooks,
  };
  return row;
}

export function createWorkspaceHookSourceInput(input: SourceRequest): WorkspaceHookSourceInput {
  const absolute = resolve(input.path);
  const markedExplicit = input.explicitProjectConfig === true;
  return sourceRecord(
    absolute,
    baseDirFor(absolute),
    input.discoveryOrder,
    kindFor(markedExplicit, basename(absolute)),
    markedExplicit,
    !markedExplicit && absolute === editableProjectFile(input.workingDirectory),
    input.hooks,
  );
}

async function accessible(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function discoverAsync(input: DiscoverRequest): Promise<WorkspaceHookConfigPathRef[]> {
  const directories = await climbAsync(absoluteWorkingDirectory(input), directoryHasGitAsync);
  const found: WorkspaceHookConfigPathRef[] = [];
  for (const path of hookFilesUnder(directories)) {
    remember(found, path, false, await accessible(path));
  }
  const explicitPath = input.explicitProjectConfigPath;
  if (explicitPath !== undefined) {
    const explicit = resolve(explicitPath);
    remember(found, explicit, true, await accessible(explicit));
  }
  return uniqueRefs(found);
}

type SourceList = WorkspaceHookSourceInput[];
type ReadErrorList = WorkspaceHookSourceReadError[];
type LoadedSources = Record<"sources", SourceList> & Record<"errors", ReadErrorList>;

function blankRequest(): SourceRequest {
  return {
    path: "",
    workingDirectory: "",
    hooks: {},
    discoveryOrder: 0,
  };
}

async function loadOne(
  ref: WorkspaceHookConfigPathRef,
  workingDirectory: string,
  discoveryOrder: number,
): Promise<WorkspaceHookSourceInput | WorkspaceHookSourceReadError | undefined> {
  let text: string;
  try {
    text = await readFile(ref.path, "utf8");
  } catch (failure: unknown) {
    return { path: ref.path, error: failure };
  }
  try {
    const root = asRecord(JSON.parse(text) as unknown);
    if (!root || root.hooks === undefined) return;
    const hooks = workspaceHooksConfigSchema.parse(root.hooks);
    const request = blankRequest();
    request.path = ref.path;
    request.workingDirectory = workingDirectory;
    request.hooks = hooks;
    request.discoveryOrder = discoveryOrder;
    request.explicitProjectConfig = ref.explicitProjectConfig;
    return createWorkspaceHookSourceInput(request);
  } catch (failure: unknown) {
    return { path: ref.path, error: failure };
  }
}

function isReadError(
  value: WorkspaceHookSourceInput | WorkspaceHookSourceReadError,
): value is WorkspaceHookSourceReadError {
  return "error" in value;
}

export async function readWorkspaceHookProjectSources(
  input: DiscoverRequest,
): Promise<LoadedSources> {
  const refs = await discoverAsync(input);
  const sources: SourceList = [];
  const errors: ReadErrorList = [];
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!ref) continue;
    const loaded = await loadOne(ref, input.workingDirectory, index);
    if (loaded === undefined) continue;
    if (isReadError(loaded)) errors.push(loaded);
    else sources.push(loaded);
  }
  const outcome: LoadedSources = { sources, errors };
  return outcome;
}
