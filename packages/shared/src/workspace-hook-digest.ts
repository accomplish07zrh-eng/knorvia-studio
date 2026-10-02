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

function sourcePathForDigest(workspacePath: string, sourcePath: string): string {
  const path = relative(resolve(workspacePath), resolve(sourcePath)).replaceAll("\\", "/");
  return path || basename(sourcePath);
}

function hashPayload(payload: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function optionalMarker(value: boolean | number | undefined): unknown[] {
  return value === undefined ? ["unset"] : ["set", value];
}

function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeSnapshot(child);
    }
  }
  return value;
}

export function resolveWorkspaceHookEntries(input: {
  workspacePath: string;
  sources: readonly WorkspaceHookSourceInput[];
  runtimeRoot: WorkspaceHookRuntimeRoot;
}): CanonicalWorkspaceHookEntryData[] {
  const entries: CanonicalWorkspaceHookEntryData[] = [];
  for (const [sourceFileIndex, source] of input.sources.entries()) {
    const sourceRelativePath = sourcePathForDigest(input.workspacePath, source.canonicalPath);
    for (const event of WORKSPACE_HOOK_EVENT_NAMES) {
      for (const [matcherIndex, matcher] of (source.hooks.events?.[event] ?? []).entries()) {
        for (const [hookIndex, hook] of matcher.hooks.entries()) {
          const gates = resolveWorkspaceHookConfiguredGates({
            sourceEnabled: source.hooks.enabled,
            declarationEnabled: hook.enabled,
            runtimeHooksEnabled: input.runtimeRoot.enabled,
          });
          const common = {
            reviewItemId: `workspace-hook-${sourceFileIndex}-${event}-${matcherIndex}-${hookIndex}`,
            event,
            matcherIndex,
            hookIndex,
            sourceFileIndex,
            sourceRelativePath,
            matcher: matcher.matcher ?? null,
            command: hook.command,
            resolvedTimeoutMs: resolveWorkspaceHookTimeoutMs(hook, input.runtimeRoot.timeoutMs),
            resolvedMaxOutputBytes: input.runtimeRoot.maxOutputBytes,
            ...(hook.statusMessage ? { statusMessage: hook.statusMessage } : {}),
            ...gates,
            editable: source.editable,
            declarationDigestAlgorithm: "sha256" as const,
            hookDeclarationDigest: createWorkspaceHookDeclarationDigest({
              sourceRelativePath,
              sourceDiscoveryOrder: source.discoveryOrder,
              event,
              matcher: matcher.matcher ?? null,
              matcherIndex,
              hookIndex,
              hook,
              defaultTimeoutMs: input.runtimeRoot.timeoutMs,
              resolvedMaxOutputBytes: input.runtimeRoot.maxOutputBytes,
            }),
          };
          if (hook.type === "process") {
            entries.push({
              ...common,
              type: "process",
              ...(hook.args && hook.args.length > 0 ? { args: [...hook.args] } : {}),
            });
          } else {
            entries.push({
              ...common,
              type: "command",
              ...(hook.async === true ? { async: true } : {}),
              ...(hook.shell !== undefined ? { shell: hook.shell } : {}),
            });
          }
        }
      }
    }
  }
  return entries;
}

export function buildWorkspaceHookBundleSnapshot(input: {
  workspaceIdentity: string;
  workspacePath: string;
  sources: readonly WorkspaceHookSourceInput[];
  runtimeRoot: WorkspaceHookRuntimeRoot;
  discoveredAt?: string;
}): WorkspaceHookBundleSnapshotData | undefined {
  const hooks = resolveWorkspaceHookEntries(input);
  if (hooks.length === 0) {
    return undefined;
  }

  const sourceFiles = input.sources.map((source) => ({
    canonicalPath: source.canonicalPath,
    baseDir: source.baseDir,
    discoveryOrder: source.discoveryOrder,
    configFileKind: source.configFileKind,
    explicitProjectConfig: source.explicitProjectConfig,
    editable: source.editable,
    hooksRoot: {
      ...(source.hooks.enabled !== undefined ? { enabled: source.hooks.enabled } : {}),
      ...(source.hooks.timeoutMs !== undefined ? { timeoutMs: source.hooks.timeoutMs } : {}),
      ...(source.hooks.maxOutputBytes !== undefined
        ? { maxOutputBytes: source.hooks.maxOutputBytes }
        : {}),
    },
  }));
  const sourceTuples = input.sources.map((source) => [
    sourcePathForDigest(input.workspacePath, source.canonicalPath),
    source.discoveryOrder,
    source.configFileKind,
    source.explicitProjectConfig,
    optionalMarker(source.hooks.enabled),
    optionalMarker(source.hooks.timeoutMs),
    optionalMarker(source.hooks.maxOutputBytes),
  ]);
  const hookTuples = hooks.map((hook) => [
    hook.hookDeclarationDigest,
    hook.sourceRootEnabled,
    hook.declarationEnabled,
    hook.runtimeHooksEnabled,
    hook.configuredEnabled,
  ]);
  const discoveredAt = input.discoveredAt ?? new Date().toISOString();
  const bundleDigest = hashPayload([
    "workspace-hook-bundle",
    WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION,
    sourceTuples,
    hookTuples,
  ]);

  return freezeSnapshot<WorkspaceHookBundleSnapshotData>({
    schemaVersion: WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION,
    workspaceIdentity: input.workspaceIdentity,
    discoveredAt,
    sourceFiles,
    hooks,
    digestAlgorithm: "sha256",
    bundleDigest,
  });
}

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
}): string {
  const hook = input.hook;
  let execution: unknown[];
  if (hook.type === "process") {
    execution = ["process", hook.command, [...(hook.args ?? [])]];
  } else {
    const shellMarker =
      hook.shell === undefined
        ? ["unset"]
        : hook.shell === true
          ? ["true"]
          : ["string", hook.shell];
    execution = ["command", hook.command, hook.async === true, shellMarker];
  }
  const resolvedTimeoutMs = resolveWorkspaceHookTimeoutMs(hook, input.defaultTimeoutMs);
  return hashPayload([
    "workspace-hook-declaration",
    WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION,
    input.sourceRelativePath,
    input.sourceDiscoveryOrder,
    input.event,
    input.matcher,
    input.matcherIndex,
    input.hookIndex,
    execution,
    resolvedTimeoutMs,
    input.resolvedMaxOutputBytes,
  ]);
}
