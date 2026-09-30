// Snapshot codec contract: specs/knorvia-read-state-snapshots.md.
// Existing repository licence remains applicable pending source review.
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

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string";
const identity = (value: unknown): boolean => text(value) && value.length > 0;
type FieldRule = readonly [
  keyof PersistedReadFileStateMetadata,
  (value: unknown) => boolean,
  optional?: true,
];

// 持久化入口按字段投影，未知字段不进入恢复状态；可选窗口沿用忽略非法值的旧格式语义。
const FIELDS: readonly FieldRule[] = [
  ["schemaVersion", (value) => value === READ_FILE_STATE_METADATA_SCHEMA_VERSION],
  ["tool", (value) => value === "Read" || value === "Write" || value === "Edit"],
  ["path", identity],
  ["content", text],
  ["offset", finite, true],
  ["limit", finite, true],
  ["isPartialView", (value) => typeof value === "boolean"],
  ["readAtMs", finite],
  ["revisionId", identity],
  ["mtimeMs", finite],
  ["sizeBytes", finite],
];

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseReadFileStateMetadata(
  metadata: unknown,
): PersistedReadFileStateMetadata | undefined {
  const source = record(record(metadata)?.readFileState);
  if (!source) return undefined;
  const snapshot: Record<string, unknown> = {};
  for (const [name, accepts, optional] of FIELDS) {
    const value = source[name];
    if (accepts(value)) snapshot[name] = value;
    else if (!optional) return undefined;
  }
  return snapshot as unknown as PersistedReadFileStateMetadata;
}

export function createReadFileStateMetadataFromEntry(input: {
  completedAt: Date;
  entry?: ReadFileStateEntry;
  toolName: PersistedReadFileStateTool;
}): PersistedReadFileStateMetadata | undefined {
  const value = input.entry;
  if (!value || !value.revisionId || value.mtimeMs === undefined || value.sizeBytes === undefined) {
    // 不用当前磁盘或展示文本补齐 freshness，避免恢复后把外部修改错误认作已读。
    return undefined;
  }
  const snapshot: PersistedReadFileStateMetadata = {
    schemaVersion: READ_FILE_STATE_METADATA_SCHEMA_VERSION,
    tool: input.toolName,
    path: value.path,
    content: value.content,
    isPartialView: value.isPartialView,
    readAtMs: input.completedAt.getTime(),
    revisionId: value.revisionId,
    mtimeMs: value.mtimeMs,
    sizeBytes: value.sizeBytes,
  };
  if (value.offset !== undefined) snapshot.offset = value.offset;
  if (value.limit !== undefined) snapshot.limit = value.limit;
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
  const output = ReadOutputSchema.safeParse(input.output);
  if (!output.success) return undefined;
  if (output.data.type !== "text" && output.data.type !== "file_unchanged") return undefined;
  const window = record(input.toolInput);
  const key = createReadFileStateKey(
    output.data.filePath,
    finite(window?.offset) ? window.offset : undefined,
    finite(window?.limit) ? window.limit : undefined,
  );
  return createReadFileStateMetadataFromEntry({
    completedAt: input.completedAt,
    entry: input.readFileState?.get(key),
    toolName: "Read",
  });
}
