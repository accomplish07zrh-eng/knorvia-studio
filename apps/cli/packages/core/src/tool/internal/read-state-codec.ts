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
import { createReadFileStateKey } from "./read-state-query.js";
import type { ReadFileStateEntry, ReadFileStateMap } from "../types.js";

/** 持久化字段用的文本类型（与业务语义解耦，别名透明）。 */
type PersistedText = string;
/** 持久化字段用的计数类型。 */
type PersistedCount = number;
/** 持久化字段用的布尔类型。 */
type PersistedFlag = boolean;
/** 快照里的 schema 版本字面量类型。 */
type PersistedSchemaVersion = typeof READ_FILE_STATE_METADATA_SCHEMA_VERSION;
/** 快照里记录的工具名类型。 */
type PersistedToolName = PersistedReadFileStateTool;
/** 产出快照的完成时刻类型。 */
type CompletedAt = Date;
/** 持久化原始输入（形状未知）。 */
type PersistedMetadataInput = unknown;
/** 解析/产出快照的返回类型。 */
type PersistedMetadataResult = PersistedReadFileStateMetadata | undefined;

export const READ_FILE_STATE_METADATA_SCHEMA_VERSION = 1 as const;
export type PersistedReadFileStateTool = "Write" | "Edit" | "Read";

export interface PersistedReadFileStateMetadata {
  schemaVersion: PersistedSchemaVersion;
  tool: PersistedToolName;
  path: PersistedText;
  content: PersistedText;
  offset?: PersistedCount;
  limit?: PersistedCount;
  isPartialView: PersistedFlag;
  readAtMs: PersistedCount;
  revisionId: PersistedText;
  mtimeMs: PersistedCount;
  sizeBytes: PersistedCount;
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
const READ_TOOL_NAME = "Read";

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

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return record;
}

export function parseReadFileStateMetadata(
  metadata: PersistedMetadataInput,
): PersistedMetadataResult {
  const source = asPlainRecord(asPlainRecord(metadata)?.readFileState);
  if (source === undefined) return undefined;

  const projected: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(FIELD_SPECS)) {
    const raw = source[name];
    if (spec.accepts(raw)) projected[name] = raw;
    else if (!spec.optional) return;
  }
  return projected as unknown as PersistedReadFileStateMetadata;
}

interface PersistedSnapshotRequest {
  completedAt: CompletedAt;
  entry?: ReadFileStateEntry;
  toolName: PersistedToolName;
}

// 缺少任一新鲜度字段就不产出快照：不用当前磁盘或展示文本补齐，否则恢复后会把外部修改误认作已读。
// 用类型谓词而不是布尔返回，调用点才能拿到收窄后的字段类型。
type FreshReadFileStateEntry = ReadFileStateEntry & {
  revisionId: string;
  mtimeMs: number;
  sizeBytes: number;
};

function hasFreshnessFields(entry: ReadFileStateEntry): entry is FreshReadFileStateEntry {
  return Boolean(entry.revisionId) && entry.mtimeMs !== undefined && entry.sizeBytes !== undefined;
}

export function createReadFileStateMetadataFromEntry(
  input: PersistedSnapshotRequest,
): PersistedMetadataResult {
  const { entry } = input;
  if (entry === undefined) return;
  if (!hasFreshnessFields(entry)) {
    return;
  }

  const { completedAt, toolName } = input;
  const { content, isPartialView, mtimeMs, path, revisionId, sizeBytes } = entry;
  const snapshot: PersistedReadFileStateMetadata = {
    schemaVersion: READ_FILE_STATE_METADATA_SCHEMA_VERSION,
    tool: toolName,
    path,
    content,
    isPartialView,
    // 时间戳取「本次读取完成」的时刻，而不是条目里的读入时刻。
    readAtMs: completedAt.getTime(),
    revisionId,
    // 新鲜度字段直接照搬，不做任何推断。
    mtimeMs,
    sizeBytes,
  };
  if (entry.offset !== undefined) snapshot.offset = entry.offset;
  if (entry.limit !== undefined) snapshot.limit = entry.limit;
  return snapshot;
}

interface PersistedReadMetadataRequest {
  completedAt: CompletedAt;
  output: unknown;
  readFileState?: ReadFileStateMap;
  toolInput: unknown;
  toolName: string;
}

export function createReadFileStateMetadata(
  input: PersistedReadMetadataRequest,
): PersistedMetadataResult {
  if (input.toolName !== READ_TOOL_NAME) return;

  const output = ReadOutputSchema.safeParse(input.output);
  if (!output.success) return;
  if (output.data.type !== "text" && output.data.type !== "file_unchanged") return;

  const window = asPlainRecord(input.toolInput);
  const key = createReadFileStateKey(
    output.data.filePath,
    isFiniteNumber(window?.offset) ? window.offset : undefined,
    isFiniteNumber(window?.limit) ? window.limit : undefined,
  );
  return createReadFileStateMetadataFromEntry({
    completedAt: input.completedAt,
    entry: input.readFileState?.get(key),
    toolName: "Read",
  });
}
