// SPDX-License-Identifier: Apache-2.0
// 工作流存储的具体操作：port 方法体全部在这里实现，类壳只做转发。
import { readdir } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import type {
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowGraphRecord,
  WorkflowKind,
  WorkflowRunSnapshot,
  WorkflowRunListItem,
} from "@knorvia/contracts";
import {
  WorkflowDefinitionSchema,
  WorkflowEventSchema,
  WorkflowGraphRecordSchema,
  WorkflowRunSnapshotSchema,
} from "@knorvia/contracts";
import { appendJsonLine, readJson, readJsonLines, writeJson, writeText } from "./json-io.js";
import {
  isNodeError,
  normalizeRelativePath,
  sanitizePathSegment,
  throwIfAborted,
  validateDefinitionId,
  WORKFLOW_FILES,
  type WorkflowFileName,
} from "./path-rules.js";

const DEFINITION_EXTENSION = ".json";
const WRITE_CANCELLED = "Workflow file write cancelled";
const JSON_READ_CANCELLED = "Workflow JSON read cancelled";
const JSONL_READ_CANCELLED = "Workflow JSONL read cancelled";
const JSONL_APPEND_CANCELLED = "Workflow JSONL append cancelled";
const DEFINITIONS_DIR_NAME = "definitions";
const RUNS_DIR_NAME = "runs";

/** 各类载荷的解析器：校验入口集中，调用方只报 kind。 */
const PARSERS = {
  definition: WorkflowDefinitionSchema.parse,
  event: WorkflowEventSchema.parse,
  graph: WorkflowGraphRecordSchema.parse,
  run: WorkflowRunSnapshotSchema.parse,
} as const;

export interface RunQuery {
  cwd?: string;
  kind?: WorkflowKind;
  limit?: number;
}

export interface ArtifactRef {
  path: string;
  relativePath: string;
}

interface WorkflowIndexFile {
  runs: WorkflowRunListItem[];
}

/** 索引行字段表：快照与索引行的同名映射只在这里声明一次。 */
const LIST_ITEM_FIELDS = [
  "completedAt",
  "createdAt",
  "cwd",
  "kind",
  "runId",
  "status",
  "task",
  "updatedAt",
] as const satisfies readonly (keyof WorkflowRunListItem & keyof WorkflowRunSnapshot)[];

/** 索引排序：更新时间倒序。 */
export function orderRuns(runs: WorkflowRunListItem[]): WorkflowRunListItem[] {
  return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function matchesQuery(run: WorkflowRunListItem, query: RunQuery): boolean {
  if (query.cwd !== undefined && run.cwd !== query.cwd) return false;
  if (query.kind !== undefined && run.kind !== query.kind) return false;
  return true;
}

function applyLimit(runs: WorkflowRunListItem[], limit: number | undefined): WorkflowRunListItem[] {
  return limit === undefined ? runs : runs.slice(0, limit);
}

function toListItem(snapshot: WorkflowRunSnapshot): WorkflowRunListItem {
  const item = {} as Record<keyof WorkflowRunListItem, unknown>;
  for (const field of LIST_ITEM_FIELDS) item[field] = snapshot[field];
  return item as WorkflowRunListItem;
}

/** 文件路径：`kind` 选文件名，`runId` 决定落在 runs 子目录还是根目录。 */
function filePath(rootDir: string, kind: WorkflowFileName, runId?: string): string {
  const base = runId === undefined ? rootDir : runRoot(rootDir, runId);
  return join(base, WORKFLOW_FILES[kind]);
}

function runRoot(rootDir: string, runId: string): string {
  return join(rootDir, RUNS_DIR_NAME, sanitizePathSegment(runId));
}

async function readIndex(rootDir: string, signal?: AbortSignal): Promise<WorkflowIndexFile> {
  const parsed = await readJson(filePath(rootDir, "index"), signal, JSON_READ_CANCELLED);
  if (parsed === null) return { runs: [] };
  const candidate = parsed as { runs?: unknown };
  const runs = Array.isArray(candidate.runs) ? (candidate.runs as WorkflowRunListItem[]) : [];
  return { runs };
}

export async function appendEventOp(
  rootDir: string,
  event: WorkflowEvent,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<void> {
  throwIfAborted(signal, cancelled);
  const payload = PARSERS.event(event);
  await appendJsonLine(
    filePath(rootDir, "events", event.runId),
    payload,
    signal,
    JSONL_APPEND_CANCELLED,
  );
}

export async function appendGraphOp(
  rootDir: string,
  runId: string,
  record: WorkflowGraphRecord,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<void> {
  throwIfAborted(signal, cancelled);
  const payload = PARSERS.graph(record);
  await appendJsonLine(filePath(rootDir, "graph", runId), payload, signal, JSONL_APPEND_CANCELLED);
}

export async function listRunsOp(
  rootDir: string,
  query: RunQuery,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<WorkflowRunListItem[]> {
  throwIfAborted(signal, cancelled);
  const ledger = await readIndex(rootDir, signal);
  const matching = ledger.runs.filter((run) => matchesQuery(run, query));
  return applyLimit(orderRuns(matching), query.limit);
}

export async function readEventsOp(
  rootDir: string,
  runId: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<WorkflowEvent[]> {
  throwIfAborted(signal, cancelled);
  const lines = await readJsonLines(
    filePath(rootDir, "events", runId),
    signal,
    JSONL_READ_CANCELLED,
  );
  return lines.map((line) => PARSERS.event(line));
}

export async function readRunOp(
  rootDir: string,
  runId: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<WorkflowRunSnapshot | null> {
  throwIfAborted(signal, cancelled);
  const parsed = await readJson(filePath(rootDir, "run", runId), signal, JSON_READ_CANCELLED);
  return parsed === null ? null : PARSERS.run(parsed);
}

async function upsertIndex(
  rootDir: string,
  snapshot: WorkflowRunSnapshot,
  signal?: AbortSignal,
): Promise<void> {
  const ledger = await readIndex(rootDir, signal);
  const rest = ledger.runs.filter((run) => run.runId !== snapshot.runId);
  const nextRuns = orderRuns([toListItem(snapshot), ...rest]);
  await writeJson(filePath(rootDir, "index"), { runs: nextRuns }, signal, WRITE_CANCELLED);
}

export async function writeSnapshotOp(
  rootDir: string,
  snapshot: WorkflowRunSnapshot,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<void> {
  throwIfAborted(signal, cancelled);
  const payload = PARSERS.run(snapshot);
  await writeJson(filePath(rootDir, "run", snapshot.runId), payload, signal, WRITE_CANCELLED);
  await upsertIndex(rootDir, snapshot, signal);
}

export async function writeArtifactOp(
  rootDir: string,
  runId: string,
  relativePath: string,
  content: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<ArtifactRef> {
  throwIfAborted(signal, cancelled);
  const safeRelativePath = normalizeRelativePath(relativePath);
  const target = join(runRoot(rootDir, runId), safeRelativePath);
  await writeText(target, content, signal, WRITE_CANCELLED, "replace");
  return { path: target, relativePath: safeRelativePath };
}

/** 定义目录缺失按「没有定义」处理，其余错误继续上抛。 */
async function listDefinitionFiles(definitionsDir: string): Promise<string[]> {
  try {
    return await readdir(definitionsDir);
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") return [];
    throw cause;
  }
}

/** 目录里的定义 id：只取 `.json`，按名字排序保证稳定。 */
async function listDefinitionIds(definitionsDir: string): Promise<string[]> {
  const names = await listDefinitionFiles(definitionsDir);
  return names
    .filter((name) => extname(name) === DEFINITION_EXTENSION)
    .map((name) => parse(name).name)
    .sort((a, b) => a.localeCompare(b));
}

export async function readDefinitionOp(
  definitionsDir: string,
  definitionId: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<WorkflowDefinition | null> {
  throwIfAborted(signal, cancelled);
  validateDefinitionId(definitionId);
  const target = join(definitionsDir, `${definitionId}${DEFINITION_EXTENSION}`);
  const parsed = await readJson(target, signal, JSON_READ_CANCELLED);
  if (parsed === null) return null;
  const definition = PARSERS.definition(parsed);
  if (definition.definitionId === definitionId) return definition;
  const text = `Workflow definition id mismatch: requested ${definitionId}, file declares ${definition.definitionId}`;
  throw new Error(text);
}

export async function listDefinitionsOp(
  definitionsDir: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<WorkflowDefinition[]> {
  throwIfAborted(signal, cancelled);
  const definitions: WorkflowDefinition[] = [];
  for (const definitionId of await listDefinitionIds(definitionsDir)) {
    const definition = await readDefinitionOp(definitionsDir, definitionId, signal, cancelled);
    if (definition) definitions.push(definition);
  }
  return definitions;
}

export function definitionsDirectory(base: string): string {
  return join(base, DEFINITIONS_DIR_NAME);
}
