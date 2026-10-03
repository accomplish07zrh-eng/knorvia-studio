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

const declarationFields = [
  "type",
  "command",
  "args",
  "async",
  "enabled",
  "shell",
  "statusMessage",
  "timeout",
  "timeoutMs",
];

function customFields(raw: WorkspaceHookDefinition): Record<string, unknown> | undefined {
  const custom = { ...raw } as Record<string, unknown>;
  for (const field of declarationFields) delete custom[field];
  return Object.keys(custom).length > 0 ? custom : undefined;
}

function declarationEnabled(hook: Hook): boolean {
  const configured = hook.configuredState;
  return configured && hook.enabled === configured.configuredEnabled
    ? configured.declarationEnabled
    : hook.enabled;
}

function writableDeclaration(hook: Hook): WorkspaceHookDefinition {
  const common = {
    ...hook.custom,
    type: hook.type,
    command: hook.command,
    enabled: declarationEnabled(hook),
    ...(hook.statusMessage ? { statusMessage: hook.statusMessage } : {}),
  };
  if (hook.type === "process") {
    return {
      ...common,
      type: "process",
      ...(hook.args && hook.args.length > 0 ? { args: hook.args } : {}),
      ...(hook.timeout ? { timeoutMs: hook.timeout * 1000 } : {}),
    };
  }
  return {
    ...common,
    type: "command",
    ...(hook.async ? { async: true } : {}),
    ...(hook.shell ? { shell: hook.shell } : {}),
    ...(hook.timeout ? { timeout: hook.timeout } : {}),
  };
}

function canonicalView(input: {
  source: WorkspaceHookSourceInput;
  entry: CanonicalWorkspaceHookEntryData;
  id: string;
  location: SettingsDirectoryLocation;
  workspaceFields?: Pick<
    WorkspaceHookDiscoveryState,
    "workspaceIdentity" | "bundleDigest" | "hookDeclarationDigest" | "trustState"
  >;
}): Hook {
  const { source, entry, id, location, workspaceFields } = input;
  const raw = source.hooks.events?.[entry.event]?.[entry.matcherIndex]?.hooks[entry.hookIndex];
  if (!raw) throw new Error(`Workspace Hook provenance is incomplete for ${entry.reviewItemId}`);
  const configuredState: HookConfiguredState = {
    sourceRootEnabled: entry.sourceRootEnabled,
    declarationEnabled: entry.declarationEnabled,
    runtimeHooksEnabled: entry.runtimeHooksEnabled,
    configuredEnabled: entry.configuredEnabled,
    sourcePath: source.canonicalPath,
  };
  return {
    id,
    event: entry.event,
    matcher: entry.matcher ?? undefined,
    type: entry.type,
    command: entry.command,
    ...(entry.type === "process" ? { args: [...(entry.args ?? [])] } : {}),
    ...(entry.type === "command" && entry.async !== undefined ? { async: entry.async } : {}),
    ...(entry.type === "command" && entry.shell !== undefined ? { shell: entry.shell } : {}),
    ...(entry.statusMessage ? { statusMessage: entry.statusMessage } : {}),
    timeout:
      (raw.type === "command" ? raw.timeout : undefined) ??
      (raw.timeoutMs !== undefined ? Math.round(raw.timeoutMs) / 1000 : undefined),
    enabled: entry.configuredEnabled,
    editable: entry.editable,
    configuredState,
    ...(workspaceFields
      ? {
          workspaceHook: {
            ...configuredState,
            reviewItemId: entry.reviewItemId,
            sourceFileIndex: entry.sourceFileIndex,
            ...workspaceFields,
          },
        }
      : {}),
    custom: customFields(raw),
    location,
  };
}

export function fromProjectSnapshot(input: {
  sources: WorkspaceHookSourceInput[];
  snapshot: WorkspaceHookBundleSnapshotData | undefined;
  workspaceIdentity: string;
  workspacePath: string;
  persistentTrustedDigests?: ReadonlySet<string>;
}): Hook[] {
  if (!input.snapshot) return [];
  const snapshot = input.snapshot;
  return snapshot.hooks.map((entry) => {
    const source = input.sources[entry.sourceFileIndex];
    if (!source) throw new Error(`Workspace Hook source is missing for ${entry.reviewItemId}`);
    return canonicalView({
      source,
      entry,
      id: entry.reviewItemId,
      location: {
        source: "knorvia",
        scope: "project",
        directoryPath: dirname(source.canonicalPath),
        projectPath: input.workspacePath,
      },
      workspaceFields: {
        workspaceIdentity: input.workspaceIdentity,
        bundleDigest: snapshot.bundleDigest,
        hookDeclarationDigest: entry.hookDeclarationDigest,
        trustState: input.persistentTrustedDigests?.has(entry.hookDeclarationDigest)
          ? "trusted_persistent"
          : "pending_trust",
      },
    });
  });
}

export function fromUserKnorviaSource(input: {
  source: WorkspaceHookSourceInput | undefined;
  runtimeRoot: WorkspaceHookRuntimeRoot;
  workspacePath: string;
  location: SettingsDirectoryLocation;
}): Hook[] {
  if (!input.source) return [];
  const source = input.source;
  return resolveWorkspaceHookEntries({
    workspacePath: input.workspacePath,
    sources: [source],
    runtimeRoot: input.runtimeRoot,
  }).map((entry, index) =>
    canonicalView({ source, entry, id: `hook-knorvia-user-${index}`, location: input.location }),
  );
}

export function fromLegacyHooksConfig(input: {
  legacyConfig: LegacyHooksConfig | null;
  location: SettingsDirectoryLocation;
  isHookEvent: (value: string) => value is HookEvent;
}): Hook[] {
  const hooks: Hook[] = [];
  for (const [event, matchers] of Object.entries(input.legacyConfig?.hooks ?? {})) {
    if (!input.isHookEvent(event) || !Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      for (const hook of matcher.hooks ?? []) {
        if ((hook.type !== "command" && hook.type !== "process") || !hook.command) continue;
        hooks.push({
          id: `hook-${input.location.source}-${input.location.scope}-${hooks.length}`,
          event,
          matcher: matcher.matcher,
          type: hook.type,
          command: hook.command,
          ...(hook.type === "process" ? { args: hook.args ?? [] } : {}),
          ...(hook.async !== undefined ? { async: hook.async } : {}),
          ...(hook.shell !== undefined ? { shell: hook.shell } : {}),
          ...(hook.statusMessage ? { statusMessage: hook.statusMessage } : {}),
          timeout:
            hook.timeout ??
            (hook.timeoutMs !== undefined ? Math.round(hook.timeoutMs / 1000) : undefined),
          enabled: false,
          editable: false,
          location: input.location,
        });
      }
    }
  }
  return hooks;
}

export function toKnorviaHooksEvents(hooks: Hook[]): WorkspaceHooksConfig["events"] {
  const events: NonNullable<WorkspaceHooksConfig["events"]> = {};
  for (const hook of hooks) {
    const matchers = events[hook.event] ?? [];
    let matcher = matchers.find((candidate) => candidate.matcher === hook.matcher);
    if (!matcher) {
      matcher = { ...(hook.matcher ? { matcher: hook.matcher } : {}), hooks: [] };
      matchers.push(matcher);
      events[hook.event] = matchers;
    }
    matcher.hooks.push(writableDeclaration(hook));
  }
  return events;
}

export function resolveNextRootEnabled(
  existingEnabled: boolean | undefined,
  hooks: Hook[],
): boolean | undefined {
  return hooks.some(
    (hook) =>
      hook.enabled &&
      (!hook.configuredState || hook.enabled !== hook.configuredState.configuredEnabled),
  )
    ? true
    : existingEnabled;
}
