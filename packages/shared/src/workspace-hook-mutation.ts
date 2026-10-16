// SPDX-License-Identifier: Apache-2.0

import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import {
  workspaceHooksConfigSchema,
  type WorkspaceHookDefinition,
  type WorkspaceHookEventName,
} from "./workspace-hook-config.js";
import { createWorkspaceHookDeclarationDigest } from "./workspace-hook-digest.js";
import type { WorkspaceHookBundleSnapshotData } from "./workspace-hook-digest.js";

type BeforeRename = () => void | Promise<void>;

export type AtomicWorkspaceHookConfigWriteOptions = {
  beforeRename?: BeforeRename;
};

const CODE = {
  mismatch: "workspace_hooks_snapshot_mismatch",
  bundle: "workspace_hooks_bundle_changed",
  unreadable: "workspace_hooks_config_unreadable",
  writeFailed: "workspace_hooks_config_write_failed",
} as const;

type MutationCode = (typeof CODE)[keyof typeof CODE];

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
  readonly code: MutationCode;

  constructor(code: MutationCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
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
  // 句柄关闭失败不能盖住原来的写入错误。
  await handle?.close().catch(() => undefined);
}

async function discard(path: string): Promise<void> {
  // 临时文件清不掉时仍抛出原始错误。
  await rm(path, { force: true }).catch(() => undefined);
}

type WrittenDocument = Record<string, unknown>;

export async function atomicWriteWorkspaceHookConfig(
  destination: string,
  document: WrittenDocument,
  settings: AtomicWorkspaceHookConfigWriteOptions = {},
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const scratch = scratchPath(destination);
  let cursor: ScratchHandle | undefined;
  try {
    cursor = await open(scratch, "wx", 0o600);
    const body = `${JSON.stringify(document, null, 2)}\n`;
    await cursor.writeFile(body, "utf8");
    await cursor.sync();
    await cursor.close();
    cursor = undefined;
    const notify = settings.beforeRename;
    if (notify) await notify();
    await rename(scratch, destination);
  } catch (failure) {
    await release(cursor);
    await discard(scratch);
    throw failure;
  }
}

function rejectSnapshot(message: string): WorkspaceHookMutationError {
  return new WorkspaceHookMutationError(CODE.mismatch, message);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return;
}

type ToggleRequest = Record<"configPath" | "reviewItemId", string> &
  Record<"enabled", boolean> &
  Record<"snapshot", WorkspaceHookBundleSnapshotData> & {
    writeOptions?: AtomicWorkspaceHookConfigWriteOptions;
  };

type DeclarationDraft = Parameters<typeof createWorkspaceHookDeclarationDigest>[0];

function declarationDraft(
  hook: WorkspaceHookDefinition,
  event: WorkspaceHookEventName,
  matcher: string | null,
  matcherIndex: number,
  hookIndex: number,
  defaultTimeoutMs: number,
  resolvedMaxOutputBytes: number,
  sourceRelativePath: string,
  sourceDiscoveryOrder: number,
): DeclarationDraft {
  const draft: DeclarationDraft = {
    hook,
    event,
    matcher,
    matcherIndex,
    hookIndex,
    defaultTimeoutMs,
    resolvedMaxOutputBytes,
    sourceRelativePath,
    sourceDiscoveryOrder,
  };
  return draft;
}

async function readConfigRoot(configPath: string): Promise<unknown> {
  const text = await readFile(configPath, "utf8").catch((cause: unknown) => {
    throw new WorkspaceHookMutationError(CODE.unreadable, UNREADABLE_TEXT, { cause });
  });
  try {
    return JSON.parse(text) as unknown;
  } catch (cause: unknown) {
    throw new WorkspaceHookMutationError(CODE.unreadable, UNREADABLE_TEXT, { cause });
  }
}

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
  if (!targetOk) throw rejectSnapshot(MISMATCH_TEXT.target);

  const raw = await readConfigRoot(configPath);
  const root = asRecord(raw);
  if (!root) throw rejectSnapshot(MISMATCH_TEXT.root);
  const parsedHooks = workspaceHooksConfigSchema.safeParse(root.hooks);
  if (!parsedHooks.success) throw rejectSnapshot(MISMATCH_TEXT.schema);
  const rawHooks = asRecord(root.hooks);
  if (!rawHooks) throw rejectSnapshot(MISMATCH_TEXT.hooks);
  const rawEvents = asRecord(rawHooks.events);
  if (!rawEvents) throw rejectSnapshot(MISMATCH_TEXT.events);
  const eventName = entry.event;
  const rawEvent = rawEvents[eventName];
  if (!Array.isArray(rawEvent)) throw rejectSnapshot(MISMATCH_TEXT.event);
  const rawMatcher = asRecord(rawEvent[entry.matcherIndex]);
  if (!rawMatcher || !Array.isArray(rawMatcher.hooks)) throw rejectSnapshot(MISMATCH_TEXT.matcher);
  const rawDeclaration = asRecord(rawMatcher.hooks[entry.hookIndex]);
  if (!rawDeclaration) throw rejectSnapshot(MISMATCH_TEXT.declaration);
  const parsedGroup = parsedHooks.data.events?.[entry.event]?.[entry.matcherIndex];
  const parsedDeclaration = parsedGroup?.hooks[entry.hookIndex];
  if (!parsedDeclaration || typeof parsedDeclaration !== "object")
    throw rejectSnapshot(MISMATCH_TEXT.parsed);

  // 默认超时用审阅时已经算出的毫秒，根上的默认值后来变了也不算声明被改。
  const declarationDigest = createWorkspaceHookDeclarationDigest(
    declarationDraft(
      parsedDeclaration,
      entry.event,
      parsedGroup.matcher ?? null,
      entry.matcherIndex,
      entry.hookIndex,
      entry.resolvedTimeoutMs,
      entry.resolvedMaxOutputBytes,
      entry.sourceRelativePath,
      source.discoveryOrder,
    ),
  );
  if (declarationDigest !== entry.hookDeclarationDigest)
    throw rejectSnapshot(MISMATCH_TEXT.changed);
  rawDeclaration.enabled = request.enabled;
  await atomicWriteWorkspaceHookConfig(configPath, root, request.writeOptions);
}
