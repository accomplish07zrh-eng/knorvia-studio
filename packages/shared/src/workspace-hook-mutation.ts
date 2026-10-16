// SPDX-License-Identifier: Apache-2.0

import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { workspaceHooksConfigSchema } from "./workspace-hook-config.js";
import { createWorkspaceHookDeclarationDigest } from "./workspace-hook-digest.js";
import type { WorkspaceHookBundleSnapshotData } from "./workspace-hook-digest.js";

export type AtomicWorkspaceHookConfigWriteOptions = {
  beforeRename?: () => void | Promise<void>;
};

const MUTATION_CODES = [
  "workspace_hooks_snapshot_mismatch",
  "workspace_hooks_bundle_changed",
  "workspace_hooks_config_unreadable",
  "workspace_hooks_config_write_failed",
] as const;

type MutationCode = (typeof MUTATION_CODES)[number];

const MISMATCH_TEXT = {
  target: "Workspace Hook toggle target is not the current editable project config",
  root: "Workspace Hook config root is not an object",
  schema: "Workspace Hook config no longer matches its schema",
  hooks: "Workspace Hook config has no hooks object",
  events: "Workspace Hook config has no events object",
  event: "Workspace Hook event no longer exists",
  matcher: "Workspace Hook matcher no longer exists",
  declaration: "Workspace Hook declaration no longer exists",
  parsed: "Workspace Hook declaration no longer matches its schema",
  changed: "Workspace Hook declaration changed after review",
} as const;

const UNREADABLE_TEXT = "Workspace Hook config could not be read";

export class WorkspaceHookMutationError extends Error {
  override name = "WorkspaceHookMutationError";

  constructor(
    readonly code: MutationCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type ScratchHandle = {
  writeFile(payload: string, encoding: "utf8"): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
};

function scratchPath(filePath: string): string {
  const folder = dirname(filePath);
  const nonce = Math.random().toString(16).slice(2);
  const leaf = `.${basename(filePath)}.${process.pid}.${Date.now()}.${nonce}.tmp`;
  return resolve(folder, leaf);
}

async function release(handle: ScratchHandle | undefined): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // 句柄关闭失败不能盖住原来的写入错误。
  }
}

async function discard(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // 临时文件清不掉时仍抛出原始错误。
  }
}

type AtomicWrite = (
  filePath: string,
  value: Record<string, unknown>,
  options?: AtomicWorkspaceHookConfigWriteOptions,
) => Promise<void>;

export const atomicWriteWorkspaceHookConfig: AtomicWrite = async (
  filePath,
  value,
  options = {},
) => {
  await mkdir(dirname(filePath), { recursive: true });
  const scratch = scratchPath(filePath);
  let cursor: ScratchHandle | undefined;
  try {
    cursor = await open(scratch, "wx", 0o600);
    const body = `${JSON.stringify(value, null, 2)}\n`;
    await cursor.writeFile(body, "utf8");
    await cursor.sync();
    await cursor.close();
    cursor = undefined;
    const notify = options.beforeRename;
    if (notify) await notify();
    await rename(scratch, filePath);
  } catch (error) {
    await release(cursor);
    await discard(scratch);
    throw error;
  }
};

function mismatch(message: string): WorkspaceHookMutationError {
  return new WorkspaceHookMutationError("workspace_hooks_snapshot_mismatch", message);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return;
}

type ToggleRequest = {
  configPath: string;
  snapshot: WorkspaceHookBundleSnapshotData;
  reviewItemId: string;
  enabled: boolean;
  writeOptions?: AtomicWorkspaceHookConfigWriteOptions;
};

export async function writeWorkspaceHookConfiguredToggle(request: ToggleRequest): Promise<void> {
  const configPath = resolve(request.configPath);
  const entry = request.snapshot.hooks.find((item) => item.reviewItemId === request.reviewItemId);
  const source = entry ? request.snapshot.sourceFiles[entry.sourceFileIndex] : undefined;
  const targetOk =
    entry !== undefined &&
    entry.editable &&
    source !== undefined &&
    source.editable &&
    source.configFileKind === ".knorvia-studio/config.json" &&
    resolve(source.canonicalPath) === configPath;
  if (!targetOk) throw mismatch(MISMATCH_TEXT.target);

  let raw: unknown;
  try {
    const text = await readFile(configPath, "utf8");
    raw = JSON.parse(text);
  } catch (error) {
    throw new WorkspaceHookMutationError("workspace_hooks_config_unreadable", UNREADABLE_TEXT, {
      cause: error,
    });
  }

  const root = asRecord(raw);
  if (!root) throw mismatch(MISMATCH_TEXT.root);
  const parsedHooks = workspaceHooksConfigSchema.safeParse(root.hooks);
  if (!parsedHooks.success) throw mismatch(MISMATCH_TEXT.schema);
  const rawHooks = asRecord(root.hooks);
  if (!rawHooks) throw mismatch(MISMATCH_TEXT.hooks);
  const rawEvents = asRecord(rawHooks.events);
  if (!rawEvents) throw mismatch(MISMATCH_TEXT.events);
  const rawEvent = rawEvents[entry.event];
  if (!Array.isArray(rawEvent)) throw mismatch(MISMATCH_TEXT.event);
  const rawMatcher = asRecord(rawEvent[entry.matcherIndex]);
  if (!rawMatcher || !Array.isArray(rawMatcher.hooks)) throw mismatch(MISMATCH_TEXT.matcher);
  const rawDeclaration = asRecord(rawMatcher.hooks[entry.hookIndex]);
  if (!rawDeclaration) throw mismatch(MISMATCH_TEXT.declaration);
  const parsedGroup = parsedHooks.data.events?.[entry.event]?.[entry.matcherIndex];
  const parsedDeclaration = parsedGroup?.hooks[entry.hookIndex];
  if (!parsedDeclaration || typeof parsedDeclaration !== "object")
    throw mismatch(MISMATCH_TEXT.parsed);

  const digestInput: Parameters<typeof createWorkspaceHookDeclarationDigest>[0] = {
    hook: parsedDeclaration,
    event: entry.event,
    matcher: parsedGroup.matcher ?? null,
    matcherIndex: entry.matcherIndex,
    hookIndex: entry.hookIndex,
    defaultTimeoutMs: entry.resolvedTimeoutMs,
    resolvedMaxOutputBytes: entry.resolvedMaxOutputBytes,
    sourceRelativePath: entry.sourceRelativePath,
    sourceDiscoveryOrder: source.discoveryOrder,
  };
  // 默认超时用审阅时已经算出的毫秒，根上的默认值后来变了也不算声明被改。
  const declarationDigest = createWorkspaceHookDeclarationDigest(digestInput);
  if (declarationDigest !== entry.hookDeclarationDigest) throw mismatch(MISMATCH_TEXT.changed);
  rawDeclaration.enabled = request.enabled;
  await atomicWriteWorkspaceHookConfig(configPath, root, request.writeOptions);
}
