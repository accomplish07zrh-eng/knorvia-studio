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

export type WorkspaceHookConfigFileKind =
  | typeof KIND_PROJECT
  | typeof KIND_STUDIO
  | typeof KIND_EXPLICIT;

const finitePositive = z.number().finite().positive();
const commandText = z.string().min(1);
const optionalSwitch = z.boolean().optional();
const optionalNote = commandText.optional();

function loose<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).passthrough();
}

function locked<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).strict();
}

export const workspaceHookProcessConfigSchema = loose({
  type: z.literal("process"),
  command: commandText,
  enabled: optionalSwitch,
  args: z.array(z.string()).optional(),
  timeoutMs: finitePositive.optional(),
  statusMessage: optionalNote,
});

export const workspaceHookCommandConfigSchema = loose({
  type: z.literal("command"),
  command: commandText,
  enabled: optionalSwitch,
  async: optionalSwitch,
  shell: z.union([z.literal(true), commandText]).optional(),
  timeout: finitePositive.optional(),
  timeoutMs: finitePositive.optional(),
  statusMessage: optionalNote,
});

const hookDefinition = z.discriminatedUnion("type", [
  workspaceHookProcessConfigSchema,
  workspaceHookCommandConfigSchema,
]);

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

export type WorkspaceHookDefinition =
  | z.output<typeof workspaceHookCommandConfigSchema>
  | z.output<typeof workspaceHookProcessConfigSchema>;

export type WorkspaceHooksConfig = z.output<typeof workspaceHooksConfigSchema>;

type PathText = "canonicalPath" | "baseDir" | "path";

export type WorkspaceHookSourceInput = Record<"canonicalPath" | "baseDir", string> & {
  discoveryOrder: number;
  configFileKind: WorkspaceHookConfigFileKind;
  explicitProjectConfig: boolean;
  editable: boolean;
  hooks: WorkspaceHooksConfig;
};

export type WorkspaceHookRuntimeRoot = Record<"enabled", boolean> &
  Record<"timeoutMs" | "maxOutputBytes", number>;

export type WorkspaceHookConfigPathRef = Record<PathText, string> & {
  explicitProjectConfig: boolean;
};

export type WorkspaceHookSourceReadError = { path: string; error: unknown };

type RootSlice = Partial<Pick<WorkspaceHooksConfig, "enabled" | "timeoutMs" | "maxOutputBytes">>;

type TimeoutHook = Pick<WorkspaceHookDefinition, "type" | "timeoutMs"> & { timeout?: number };

type DiscoverRequest = { workingDirectory: string; explicitProjectConfigPath?: string };

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

export function resolveWorkspaceHookMaxOutputBytes(maxOutputBytes: number): number {
  return atLeastOne(maxOutputBytes);
}

export function resolveWorkspaceHookRuntimeRoot(
  roots: readonly (RootSlice | undefined)[],
): WorkspaceHookRuntimeRoot {
  const folded = roots.reduce<WorkspaceHookRuntimeRoot>(
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

type GateInput = {
  sourceEnabled?: boolean;
  declarationEnabled?: boolean;
  runtimeHooksEnabled: boolean;
};

export function resolveWorkspaceHookConfiguredGates(input: GateInput) {
  const sourceRootEnabled = input.sourceEnabled !== false;
  const declarationEnabled = input.declarationEnabled !== false;
  // 先读运行时开关给返回字段，与运算再读一次。getter 两次可以不同。
  const reportedRuntime = input.runtimeHooksEnabled;
  const configuredEnabled = sourceRootEnabled && declarationEnabled && input.runtimeHooksEnabled;
  const gates = {
    sourceRootEnabled,
    declarationEnabled,
    runtimeHooksEnabled: reportedRuntime,
    configuredEnabled,
  };
  return gates;
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
  for (const ref of refs) {
    const key = resolve(ref.path);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(ref);
  }
  return kept;
}

function climb(start: string, marked: (directory: string) => boolean): string[] {
  const visited: string[] = [];
  let cursor = start;
  while (cursor.length > 0) {
    visited.push(cursor);
    if (marked(cursor)) return visited.toReversed();
    const above = dirname(cursor);
    if (above === cursor) return [start];
    cursor = above;
  }
  return [start];
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
    if (above === cursor) return [start];
    cursor = above;
  }
  return [start];
}

function gitMarker(directory: string): string {
  return join(directory, ".git");
}

function looksLikeGit(stats: { isDirectory(): boolean; isFile(): boolean }): boolean {
  return stats.isFile() || stats.isDirectory();
}

function quietly(read: () => boolean): boolean {
  try {
    return read();
  } catch {
    return false;
  }
}

function directoryHasGit(directory: string): boolean {
  const marker = gitMarker(directory);
  if (!existsSync(marker)) return false;
  return quietly(() => looksLikeGit(statSync(marker)));
}

async function directoryHasGitAsync(directory: string): Promise<boolean> {
  try {
    const stats = await stat(gitMarker(directory));
    return looksLikeGit(stats);
  } catch {
    return false;
  }
}

function pushExisting(
  refs: WorkspaceHookConfigPathRef[],
  path: string,
  explicitProjectConfig: boolean,
  present: boolean,
) {
  if (present) refs.push({ path, explicitProjectConfig });
}

export function discoverWorkspaceHookConfigPaths(
  input: DiscoverRequest,
): WorkspaceHookConfigPathRef[] {
  const start = resolve(input.workingDirectory);
  const directories = climb(start, directoryHasGit);
  const refs: WorkspaceHookConfigPathRef[] = [];
  for (const path of hookFilesUnder(directories)) pushExisting(refs, path, false, existsSync(path));
  if (input.explicitProjectConfigPath !== undefined) {
    const path = resolve(input.explicitProjectConfigPath);
    pushExisting(refs, path, true, existsSync(path));
  }
  return uniqueRefs(refs);
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

type SourceRequest = {
  path: string;
  workingDirectory: string;
  hooks: WorkspaceHooksConfig;
  discoveryOrder: number;
  explicitProjectConfig?: boolean;
};

export function createWorkspaceHookSourceInput(input: SourceRequest): WorkspaceHookSourceInput {
  const absolute = resolve(input.path);
  const explicitProjectConfig = input.explicitProjectConfig === true;
  const source: WorkspaceHookSourceInput = {
    canonicalPath: absolute,
    baseDir: baseDirFor(absolute),
    discoveryOrder: input.discoveryOrder,
    configFileKind: kindFor(explicitProjectConfig, basename(absolute)),
    explicitProjectConfig,
    editable: !explicitProjectConfig && absolute === editableProjectFile(input.workingDirectory),
    hooks: input.hooks,
  };
  return source;
}

async function pathExists(path: string): Promise<boolean> {
  const found = await access(path).then(
    () => true,
    () => false,
  );
  return found;
}

async function discoverAsync(input: DiscoverRequest): Promise<WorkspaceHookConfigPathRef[]> {
  const start = resolve(input.workingDirectory);
  const directories = await climbAsync(start, directoryHasGitAsync);
  const refs: WorkspaceHookConfigPathRef[] = [];
  for (const path of hookFilesUnder(directories)) {
    pushExisting(refs, path, false, await pathExists(path));
  }
  if (input.explicitProjectConfigPath !== undefined) {
    const path = resolve(input.explicitProjectConfigPath);
    pushExisting(refs, path, true, await pathExists(path));
  }
  return uniqueRefs(refs);
}

export async function readWorkspaceHookProjectSources(input: DiscoverRequest): Promise<{
  sources: WorkspaceHookSourceInput[];
  errors: WorkspaceHookSourceReadError[];
}> {
  const refs = await discoverAsync(input);
  const sources: WorkspaceHookSourceInput[] = [];
  const errors: WorkspaceHookSourceReadError[] = [];
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!ref) continue;
    try {
      const content = await readFile(ref.path, "utf8");
      const value: unknown = JSON.parse(content);
      const root = asRecord(value);
      if (!root || root.hooks === undefined) continue;
      const hooks = workspaceHooksConfigSchema.parse(root.hooks);
      sources.push(
        createWorkspaceHookSourceInput({
          path: ref.path,
          workingDirectory: input.workingDirectory,
          hooks,
          discoveryOrder: index,
          explicitProjectConfig: ref.explicitProjectConfig,
        }),
      );
    } catch (error) {
      const failure: WorkspaceHookSourceReadError = { path: ref.path, error };
      errors.push(failure);
    }
  }
  return { sources, errors };
}
