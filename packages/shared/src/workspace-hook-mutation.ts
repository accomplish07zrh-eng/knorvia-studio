import { open, mkdir, readFile, rename, rm } from "node:fs/promises";

import { basename, dirname, resolve } from "node:path";

import type { WorkspaceHookBundleSnapshotData } from "./workspace-hook-digest.js";

import { createWorkspaceHookDeclarationDigest } from "./workspace-hook-digest.js";

import {
  workspaceHooksConfigSchema,
  type WorkspaceHookDefinition,
} from "./workspace-hook-config.js";

export interface AtomicWorkspaceHookConfigWriteOptions {
  beforeRename?: () => void | Promise<void>;
}

export class WorkspaceHookMutationError extends Error {
  constructor(
    readonly code:
      | "workspace_hooks_snapshot_mismatch"
      | "workspace_hooks_bundle_changed"
      | "workspace_hooks_config_unreadable"
      | "workspace_hooks_config_write_failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkspaceHookMutationError";
  }
}

export async function atomicWriteWorkspaceHookConfig(
  filePath: string,
  value: Record<string, unknown>,
  options: AtomicWorkspaceHookConfigWriteOptions = {},
): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = resolve(
    directory,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await options.beforeRename?.();
    await rename(temporaryPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeWorkspaceHookConfiguredToggle(input: {
  configPath: string;
  snapshot: WorkspaceHookBundleSnapshotData;
  reviewItemId: string;
  enabled: boolean;
  writeOptions?: AtomicWorkspaceHookConfigWriteOptions;
}): Promise<void> {
  const configPath = resolve(input.configPath);
  const entry = input.snapshot.hooks.find((hook) => hook.reviewItemId === input.reviewItemId);
  const source =
    entry === undefined ? undefined : input.snapshot.sourceFiles[entry.sourceFileIndex];
  if (
    !entry ||
    !entry.editable ||
    !source?.editable ||
    source.configFileKind !== ".knorvia-studio/config.json" ||
    resolve(source.canonicalPath) !== configPath
  ) {
    throw mismatch("Workspace Hook toggle target is not the current editable project config");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    // 仅读取和 JSON 解析失败归类为配置不可读，写入失败保留原错误。
    throw new WorkspaceHookMutationError(
      "workspace_hooks_config_unreadable",
      "Workspace Hook config could not be read",
      { cause: error },
    );
  }
  if (!isRecord(raw)) {
    throw mismatch("Workspace Hook config root is not an object");
  }
  const parsedHooks = workspaceHooksConfigSchema.safeParse(raw.hooks);
  if (!parsedHooks.success) {
    throw mismatch("Workspace Hook config no longer matches its schema");
  }
  const rawHooks = raw.hooks;
  if (!isRecord(rawHooks)) {
    throw mismatch("Workspace Hook config has no hooks object");
  }
  const rawEvents = rawHooks.events;
  if (!isRecord(rawEvents)) {
    throw mismatch("Workspace Hook config has no events object");
  }
  const rawEvent = rawEvents[entry.event];
  if (!Array.isArray(rawEvent)) {
    throw mismatch("Workspace Hook event no longer exists");
  }
  const rawMatcher = rawEvent[entry.matcherIndex];
  if (!isRecord(rawMatcher) || !Array.isArray(rawMatcher.hooks)) {
    throw mismatch("Workspace Hook matcher no longer exists");
  }
  const rawDeclaration = rawMatcher.hooks[entry.hookIndex];
  if (!isRecord(rawDeclaration)) {
    throw mismatch("Workspace Hook declaration no longer exists");
  }
  const parsedMatcher = parsedHooks.data.events?.[entry.event]?.[entry.matcherIndex];
  const parsedDeclaration = getParsedDeclaration(parsedMatcher?.hooks[entry.hookIndex]);
  if (!parsedDeclaration) {
    throw mismatch("Workspace Hook declaration no longer matches its schema");
  }
  // 使用审阅时的已解析默认值，保留仅根默认值漂移的既有校验边界。
  const declarationDigest = createWorkspaceHookDeclarationDigest({
    sourceRelativePath: entry.sourceRelativePath,
    sourceDiscoveryOrder: source.discoveryOrder,
    event: entry.event,
    matcher: parsedMatcher?.matcher ?? null,
    matcherIndex: entry.matcherIndex,
    hookIndex: entry.hookIndex,
    hook: parsedDeclaration,
    defaultTimeoutMs: entry.resolvedTimeoutMs,
    resolvedMaxOutputBytes: entry.resolvedMaxOutputBytes,
  });
  if (declarationDigest !== entry.hookDeclarationDigest) {
    throw mismatch("Workspace Hook declaration changed after review");
  }
  rawDeclaration.enabled = input.enabled;
  await atomicWriteWorkspaceHookConfig(configPath, raw, input.writeOptions);
}

function getParsedDeclaration(value: unknown): WorkspaceHookDefinition | undefined {
  return value && typeof value === "object" ? (value as WorkspaceHookDefinition) : undefined;
}

function mismatch(message: string): WorkspaceHookMutationError {
  return new WorkspaceHookMutationError("workspace_hooks_snapshot_mismatch", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
