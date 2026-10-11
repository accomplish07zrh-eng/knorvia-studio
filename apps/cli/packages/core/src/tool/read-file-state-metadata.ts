// SPDX-License-Identifier: Apache-2.0
// 读取状态快照的编解码契约（specs/knorvia-read-state-snapshots.md）。
//
// 三个方向的职责：
// - 解析：从持久化 JSON 里**逐字段投影**出快照，未知字段一律丢弃；
// - 产出：从内存条目生成快照，缺少新鲜度字段时宁可不产出，也不拿当前磁盘状态补齐；
// - 入口：只对 `Read` 的成功输出产出快照，并复用读取状态键定位条目。
//
// 可选字段（offset/limit）沿用旧格式语义：非法值被忽略，但字段本身仍然可选。

import { ReadOutputSchema } from "@knorvia/contracts";
import { createReadFileStateKey } from "./read-file-state.js";
import type { ReadFileStateEntry, ReadFileStateMap } from "./types.js";

export const READ_FILE_STATE_METADATA_SCHEMA_VERSION = 1;
export type PersistedReadFileStateTool = "Read" | "Write" | "Edit";

export interface PersistedReadFileStateMetadata {
  schemaVersion: typeof READ_FILE_STATE_METADATA_SCHEMA_VERSION;
  tool: PersistedReadFileStateTool;
  path: string;
  content: string;
  offset?: number;
  limit?: number;
  isPartialView: boolean;
  readAtMs: number;
  revisionId: string;
  mtimeMs: number;
  sizeBytes: number;
}

interface FieldSpec {
  readonly accepts: (value: unknown) => boolean;
  /** 可选字段：值非法时忽略该字段，而不是整体判定失败。 */
  readonly optional?: true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyText(value: unknown): boolean {
  return isText(value) && value.length > 0;
}

// 字段表是唯一事实来源：解析按它投影，新增字段只改这一处。
const FIELD_SPECS: Readonly<Record<keyof PersistedReadFileStateMetadata, FieldSpec>> = {
  schemaVersion: { accepts: (value) => value === READ_FILE_STATE_METADATA_SCHEMA_VERSION },
  tool: { accepts: (value) => value === "Read" || value === "Write" || value === "Edit" },
  path: { accepts: isNonEmptyText },
  content: { accepts: isText },
  offset: { accepts: isFiniteNumber, optional: true },
  limit: { accepts: isFiniteNumber, optional: true },
  isPartialView: { accepts: (value) => typeof value === "boolean" },
  readAtMs: { accepts: isFiniteNumber },
  revisionId: { accepts: isNonEmptyText },
  mtimeMs: { accepts: isFiniteNumber },
  sizeBytes: { accepts: isFiniteNumber },
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function parseReadFileStateMetadata(
  metadata: unknown,
): PersistedReadFileStateMetadata | undefined {
  const source = asRecord(asRecord(metadata)?.readFileState);
  if (source === undefined) return undefined;

  const snapshot: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(FIELD_SPECS)) {
    const value = source[name];
    if (spec.accepts(value)) snapshot[name] = value;
    else if (!spec.optional) return undefined;
  }
  return snapshot as unknown as PersistedReadFileStateMetadata;
}

export function createReadFileStateMetadataFromEntry(input: {
  completedAt: Date;
  entry?: ReadFileStateEntry;
  toolName: PersistedReadFileStateTool;
}): PersistedReadFileStateMetadata | undefined {
  const entry = input.entry;
  if (entry === undefined) return undefined;
  // 缺少任一新鲜度字段就不产出快照：不用当前磁盘或展示文本补齐，否则恢复后会把外部修改误认作已读。
  if (
    entry.revisionId.length === 0 ||
    entry.mtimeMs === undefined ||
    entry.sizeBytes === undefined
  ) {
    return undefined;
  }

  const snapshot: PersistedReadFileStateMetadata = {
    schemaVersion: READ_FILE_STATE_METADATA_SCHEMA_VERSION,
    tool: input.toolName,
    path: entry.path,
    content: entry.content,
    isPartialView: entry.isPartialView,
    readAtMs: input.completedAt.getTime(),
    revisionId: entry.revisionId,
    mtimeMs: entry.mtimeMs,
    sizeBytes: entry.sizeBytes,
  };
  if (entry.offset !== undefined) snapshot.offset = entry.offset;
  if (entry.limit !== undefined) snapshot.limit = entry.limit;
  return snapshot;
}

export function createReadFileStateMetadata(input: {
  completedAt: Date;
  output: unknown;
  readFileState?: ReadFileStateMap;
  toolInput: unknown;
  toolName: string;
}): PersistedReadFileStateMetadata | undefined {
  if (input.toolName !== "Read") return undefined;

  const parsed = ReadOutputSchema.safeParse(input.output);
  if (!parsed.success) return undefined;
  const { filePath, type } = parsed.data;
  if (type !== "text" && type !== "file_unchanged") return undefined;

  const window = asRecord(input.toolInput);
  const key = createReadFileStateKey(
    filePath,
    isFiniteNumber(window?.offset) ? window.offset : undefined,
    isFiniteNumber(window?.limit) ? window.limit : undefined,
  );
  return createReadFileStateMetadataFromEntry({
    completedAt: input.completedAt,
    entry: input.readFileState?.get(key),
    toolName: "Read",
  });
}
