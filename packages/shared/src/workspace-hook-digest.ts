// SPDX-License-Identifier: Apache-2.0

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

type CountKey =
  | "matcherIndex"
  | "hookIndex"
  | "sourceFileIndex"
  | "resolvedTimeoutMs"
  | "resolvedMaxOutputBytes";
type TextKey = "reviewItemId" | "sourceRelativePath" | "command" | "hookDeclarationDigest";
type FlagKey =
  | "sourceRootEnabled"
  | "declarationEnabled"
  | "runtimeHooksEnabled"
  | "configuredEnabled"
  | "editable";

export type CanonicalWorkspaceHookEntryData = Record<TextKey, string> &
  Record<CountKey, number> &
  Record<FlagKey, boolean> & {
    event: WorkspaceHookEventName;
    matcher: string | null;
    type: "command" | "process";
    args?: string[];
    async?: boolean;
    shell?: true | string;
    statusMessage?: string;
    declarationDigestAlgorithm: "sha256";
  };

type HooksRoot = { enabled?: boolean; timeoutMs?: number; maxOutputBytes?: number };

type SourceFileRow = Record<"canonicalPath" | "baseDir", string> &
  Record<"discoveryOrder", number> &
  Record<"configFileKind", WorkspaceHookConfigFileKind> &
  Record<"explicitProjectConfig" | "editable", boolean> & { hooksRoot: HooksRoot };

export type WorkspaceHookBundleSnapshotData = Record<
  "schemaVersion",
  typeof WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION
> &
  Record<"workspaceIdentity" | "discoveredAt" | "bundleDigest", string> &
  Record<"digestAlgorithm", "sha256"> & {
    sourceFiles: SourceFileRow[];
    hooks: CanonicalWorkspaceHookEntryData[];
  };

type DeclarationInput = Record<"sourceRelativePath", string> &
  Record<"matcher", string | null> &
  Record<
    | "sourceDiscoveryOrder"
    | "matcherIndex"
    | "hookIndex"
    | "defaultTimeoutMs"
    | "resolvedMaxOutputBytes",
    number
  > & { event: WorkspaceHookEventName; hook: WorkspaceHookDefinition };

function sha256Json(payload: readonly unknown[]): string {
  const serialized = JSON.stringify(payload);
  return createHash("sha256").update(serialized).digest("hex");
}

function digestPath(workspacePath: string, sourcePath: string): string {
  const fromRoot = relative(resolve(workspacePath), resolve(sourcePath)).replaceAll("\\", "/");
  return fromRoot.length > 0 ? fromRoot : basename(sourcePath);
}

function shellMarker(shell: true | string | undefined): unknown[] {
  if (typeof shell === "string") return ["string", shell];
  if (shell === true) return ["true"];
  return ["unset"];
}

function executionOf(hook: WorkspaceHookDefinition): unknown[] {
  if (hook.type === "process") {
    const copied = hook.args === undefined ? [] : hook.args.slice();
    return ["process", hook.command, copied];
  }
  return ["command", hook.command, hook.async === true, shellMarker(hook.shell)];
}

function presence(value: boolean | number | undefined): unknown[] {
  if (value === undefined) return ["unset"];
  return ["set", value];
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function blankRow(): Record<string, unknown> {
  return {};
}

function writeRow(row: Record<string, unknown>, key: string, value: unknown) {
  row[key] = value;
}

function writeRowWhen(row: Record<string, unknown>, key: string, value: unknown, keep: boolean) {
  if (keep) row[key] = value;
}

function materializeEntry(
  source: WorkspaceHookSourceInput,
  sourceFileIndex: number,
  event: WorkspaceHookEventName,
  matcherIndex: number,
  hookIndex: number,
  matcherText: string | undefined,
  hook: WorkspaceHookDefinition,
  runtimeRoot: WorkspaceHookRuntimeRoot,
  sourceRelativePath: string,
): CanonicalWorkspaceHookEntryData {
  const gates = resolveWorkspaceHookConfiguredGates({
    sourceEnabled: source.hooks.enabled,
    declarationEnabled: hook.enabled,
    runtimeHooksEnabled: runtimeRoot.enabled,
  });
  const row = blankRow();
  writeRow(
    row,
    "reviewItemId",
    `workspace-hook-${sourceFileIndex}-${event}-${matcherIndex}-${hookIndex}`,
  );
  writeRow(row, "event", event);
  writeRow(row, "matcherIndex", matcherIndex);
  writeRow(row, "hookIndex", hookIndex);
  writeRow(row, "sourceFileIndex", sourceFileIndex);
  writeRow(row, "sourceRelativePath", sourceRelativePath);
  writeRow(row, "matcher", matcherText ?? null);
  writeRow(row, "command", hook.command);
  writeRow(row, "resolvedTimeoutMs", resolveWorkspaceHookTimeoutMs(hook, runtimeRoot.timeoutMs));
  writeRow(row, "resolvedMaxOutputBytes", runtimeRoot.maxOutputBytes);
  writeRowWhen(row, "statusMessage", hook.statusMessage, Boolean(hook.statusMessage));
  writeRow(row, "sourceRootEnabled", gates.sourceRootEnabled);
  writeRow(row, "declarationEnabled", gates.declarationEnabled);
  writeRow(row, "runtimeHooksEnabled", gates.runtimeHooksEnabled);
  writeRow(row, "configuredEnabled", gates.configuredEnabled);
  writeRow(row, "editable", source.editable);
  writeRow(row, "declarationDigestAlgorithm", "sha256");
  const declaration: DeclarationInput = {
    sourceRelativePath,
    sourceDiscoveryOrder: source.discoveryOrder,
    event,
    matcher: matcherText ?? null,
    matcherIndex,
    hookIndex,
    hook,
    defaultTimeoutMs: runtimeRoot.timeoutMs,
    resolvedMaxOutputBytes: runtimeRoot.maxOutputBytes,
  };
  writeRow(row, "hookDeclarationDigest", createWorkspaceHookDeclarationDigest(declaration));
  writeRow(row, "type", hook.type);
  if (hook.type !== "command") {
    writeRowWhen(row, "args", hook.args?.slice(), hook.args !== undefined && hook.args.length > 0);
  } else {
    writeRowWhen(row, "async", true, hook.async === true);
    writeRowWhen(row, "shell", hook.shell, hook.shell !== undefined);
  }
  return row as CanonicalWorkspaceHookEntryData;
}

type EntryQuery = {
  workspacePath: string;
  sources: readonly WorkspaceHookSourceInput[];
  runtimeRoot: WorkspaceHookRuntimeRoot;
};

export function resolveWorkspaceHookEntries(input: EntryQuery): CanonicalWorkspaceHookEntryData[] {
  const entries: CanonicalWorkspaceHookEntryData[] = [];
  input.sources.forEach((source, sourceFileIndex) => {
    const sourceRelativePath = digestPath(input.workspacePath, source.canonicalPath);
    for (const event of WORKSPACE_HOOK_EVENT_NAMES) {
      const groups = source.hooks.events?.[event] ?? [];
      groups.forEach((group, matcherIndex) => {
        group.hooks.forEach((hook, hookIndex) => {
          const drafted = materializeEntry(
            source,
            sourceFileIndex,
            event,
            matcherIndex,
            hookIndex,
            group.matcher,
            hook,
            input.runtimeRoot,
            sourceRelativePath,
          );
          entries.push(drafted);
        });
      });
    }
  });
  return entries;
}

function hooksRootOf(source: WorkspaceHookSourceInput): HooksRoot {
  const hooksRoot: HooksRoot = {};
  if (source.hooks.enabled !== undefined) hooksRoot.enabled = source.hooks.enabled;
  if (source.hooks.timeoutMs !== undefined) hooksRoot.timeoutMs = source.hooks.timeoutMs;
  if (source.hooks.maxOutputBytes !== undefined)
    hooksRoot.maxOutputBytes = source.hooks.maxOutputBytes;
  return hooksRoot;
}

function sourceFileRow(source: WorkspaceHookSourceInput): SourceFileRow {
  const row = blankRow();
  writeRow(row, "canonicalPath", source.canonicalPath);
  writeRow(row, "baseDir", source.baseDir);
  writeRow(row, "discoveryOrder", source.discoveryOrder);
  writeRow(row, "configFileKind", source.configFileKind);
  writeRow(row, "explicitProjectConfig", source.explicitProjectConfig);
  writeRow(row, "editable", source.editable);
  writeRow(row, "hooksRoot", hooksRootOf(source));
  return row as SourceFileRow;
}

type BundleQuery = EntryQuery & { workspaceIdentity: string; discoveredAt?: string };

export function buildWorkspaceHookBundleSnapshot(
  input: BundleQuery,
): WorkspaceHookBundleSnapshotData | undefined {
  // 声明摘要先算。没有钩子就返回，这时不能读时钟。
  const hooks = resolveWorkspaceHookEntries(input);
  if (hooks.length === 0) return;
  const stamped = input.discoveredAt;
  const discoveredAt = stamped === undefined ? new Date().toISOString() : stamped;
  const sourceTuples = input.sources.map((source) => sourceTuple(input.workspacePath, source));
  const hookTuples = hooks.map((hook) => hookTuple(hook));
  const bundlePayload: unknown[] = [];
  bundlePayload.push("workspace-hook-bundle", WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION);
  bundlePayload.push(sourceTuples, hookTuples);
  const bundleDigest = sha256Json(bundlePayload);
  const snapshot = blankRow();
  writeRow(snapshot, "schemaVersion", WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION);
  writeRow(snapshot, "workspaceIdentity", input.workspaceIdentity);
  writeRow(snapshot, "discoveredAt", discoveredAt);
  writeRow(snapshot, "sourceFiles", input.sources.map(sourceFileRow));
  writeRow(snapshot, "hooks", hooks);
  writeRow(snapshot, "digestAlgorithm", "sha256");
  writeRow(snapshot, "bundleDigest", bundleDigest);
  return deepFreeze(snapshot as WorkspaceHookBundleSnapshotData);
}

function sourceTuple(workspacePath: string, source: WorkspaceHookSourceInput): unknown[] {
  const tuple: unknown[] = [];
  tuple.push(digestPath(workspacePath, source.canonicalPath), source.discoveryOrder);
  tuple.push(source.configFileKind, source.explicitProjectConfig);
  tuple.push(
    presence(source.hooks.enabled),
    presence(source.hooks.timeoutMs),
    presence(source.hooks.maxOutputBytes),
  );
  return tuple;
}

function hookTuple(hook: CanonicalWorkspaceHookEntryData): unknown[] {
  const tuple: unknown[] = [];
  tuple.push(hook.hookDeclarationDigest, hook.sourceRootEnabled, hook.declarationEnabled);
  tuple.push(hook.runtimeHooksEnabled, hook.configuredEnabled);
  return tuple;
}

export function createWorkspaceHookDeclarationDigest(input: DeclarationInput): string {
  const payload: unknown[] = [];
  payload.push("workspace-hook-declaration", WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION);
  payload.push(input.sourceRelativePath, input.sourceDiscoveryOrder, input.event);
  payload.push(input.matcher, input.matcherIndex, input.hookIndex);
  payload.push(executionOf(input.hook));
  payload.push(resolveWorkspaceHookTimeoutMs(input.hook, input.defaultTimeoutMs));
  payload.push(input.resolvedMaxOutputBytes);
  return sha256Json(payload);
}
