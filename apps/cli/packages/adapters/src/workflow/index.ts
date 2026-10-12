// SPDX-License-Identifier: Apache-2.0
// 工作流存储：事件/图的 JSONL 追加、快照与索引的原子写、定义目录的读取。
//
// 模块地图（本文件只放 port 实现与工厂，IO 与规则分别在两个内部模块）：
// - json-io.ts    文本/JSON/JSONL 读取与「追加或原子替换」写入
// - path-rules.ts 固定文件名、相对路径越界判定、id 合法性与取消检查
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { readdir } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import type {
  WorkflowDefinition,
  WorkflowDefinitionStorePort,
  WorkflowEvent,
  WorkflowGraphRecord,
  WorkflowKind,
  WorkflowRunSnapshot,
  WorkflowRunListItem,
  WorkflowStorePort,
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

export interface NodeWorkflowStoreOptions {
  rootDir?: string;
}

export interface NodeWorkflowDefinitionStoreOptions {
  definitionsDir?: string;
  rootDir?: string;
}

interface WorkflowIndexFile {
  runs: WorkflowRunListItem[];
}

/** 可传取消信号的调用选项：与 port 声明的结构等价，仅用于压缩签名。 */
type CallOptions = { signal?: AbortSignal } | undefined;
type RunQuery = { cwd?: string; kind?: WorkflowKind; limit?: number };
/** 端口签名的短别名：类型等价，仅用于把折行签名压成单行。 */
type GraphRecord = WorkflowGraphRecord;
type RunSnapshot = WorkflowRunSnapshot;
type ArtifactResult = { path: string; relativePath: string };

const DEFINITION_EXTENSION = ".json";
const DEFAULT_WORKFLOW_ROOT = join(resolveKnorviaDataRoot(), "cli", "workflows");
const WRITE_CANCELLED = "Workflow file write cancelled";
const JSON_READ_CANCELLED = "Workflow JSON read cancelled";
const JSONL_READ_CANCELLED = "Workflow JSONL read cancelled";
const JSONL_APPEND_CANCELLED = "Workflow JSONL append cancelled";

/** 各类载荷的解析器：校验入口集中，调用方只报 kind。 */
const PARSERS = {
  definition: WorkflowDefinitionSchema.parse,
  event: WorkflowEventSchema.parse,
  graph: WorkflowGraphRecordSchema.parse,
  run: WorkflowRunSnapshotSchema.parse,
} as const;

/** 索引排序：更新时间倒序。 */
function orderRuns(runs: WorkflowRunListItem[]): WorkflowRunListItem[] {
  return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function matchesQuery(run: WorkflowRunListItem, query: RunQuery): boolean {
  if (query.cwd !== undefined && run.cwd !== query.cwd) return false;
  if (query.kind !== undefined && run.kind !== query.kind) return false;
  return true;
}

function applyLimit(runs: WorkflowRunListItem[], limit: number | undefined): WorkflowRunListItem[] {
  return limit === undefined ? runs : runs.slice(0, limit);
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

function toListItem(snapshot: RunSnapshot): WorkflowRunListItem {
  const item = {} as Record<keyof WorkflowRunListItem, unknown>;
  for (const field of LIST_ITEM_FIELDS) item[field] = snapshot[field];
  return item as WorkflowRunListItem;
}

export class NodeWorkflowStore implements WorkflowStorePort {
  private readonly rootDir: string;

  constructor(options: NodeWorkflowStoreOptions = {}) {
    const { rootDir } = options;
    this.rootDir = rootDir ?? DEFAULT_WORKFLOW_ROOT;
  }

  async appendEvent(event: WorkflowEvent, options?: CallOptions): Promise<void> {
    throwIfAborted(options?.signal, "Workflow event append cancelled");
    const payload = PARSERS.event(event);
    const target = this.filePath("events", event.runId);
    await appendJsonLine(target, payload, options?.signal, JSONL_APPEND_CANCELLED);
  }

  async appendGraphRecord(
    runId: string,
    record: GraphRecord,
    options?: CallOptions,
  ): Promise<void> {
    throwIfAborted(options?.signal, "Workflow graph append cancelled");
    const payload = PARSERS.graph(record);
    const target = this.filePath("graph", runId);
    await appendJsonLine(target, payload, options?.signal, JSONL_APPEND_CANCELLED);
  }

  async listRuns(
    query: RunQuery = {},
    signalOptions?: CallOptions,
  ): Promise<WorkflowRunListItem[]> {
    throwIfAborted(signalOptions?.signal, "Workflow run list cancelled");
    const ledger = await this.readIndex(signalOptions?.signal);
    const matching = ledger.runs.filter((run) => matchesQuery(run, query));
    return applyLimit(orderRuns(matching), query.limit);
  }

  async readEvents(runId: string, options?: CallOptions): Promise<WorkflowEvent[]> {
    throwIfAborted(options?.signal, "Workflow event read cancelled");
    const target = this.filePath("events", runId);
    const lines = await readJsonLines(target, options?.signal, JSONL_READ_CANCELLED);
    return lines.map((line) => PARSERS.event(line));
  }

  async readLatestRun(
    query: { cwd?: string; kind?: WorkflowKind } = {},
    signalOptions?: CallOptions,
  ): Promise<RunSnapshot | null> {
    const [latest] = await this.listRuns({ ...query, limit: 1 }, signalOptions);
    if (!latest) return null;
    return await this.readRun(latest.runId, signalOptions);
  }

  async readRun(runId: string, options?: CallOptions): Promise<RunSnapshot | null> {
    throwIfAborted(options?.signal, "Workflow snapshot read cancelled");
    const target = this.filePath("run", runId);
    const parsed = await readJson(target, options?.signal, JSON_READ_CANCELLED);
    return parsed === null ? null : PARSERS.run(parsed);
  }

  async writeArtifact(
    runId: string,
    relativePath: string,
    content: string,
    options?: CallOptions,
  ): Promise<ArtifactResult> {
    throwIfAborted(options?.signal, "Workflow artifact write cancelled");
    const safeRelativePath = normalizeRelativePath(relativePath);
    const target = join(this.runRoot(runId), safeRelativePath);
    await writeText(target, content, options?.signal, WRITE_CANCELLED, "replace");
    return { path: target, relativePath: safeRelativePath };
  }

  async writeReport(
    runId: string,
    content: string,
    options?: CallOptions,
  ): Promise<ArtifactResult> {
    return await this.writeArtifact(runId, WORKFLOW_FILES.report, content, options);
  }

  async writeSnapshot(snapshot: RunSnapshot, options?: CallOptions): Promise<void> {
    throwIfAborted(options?.signal, "Workflow snapshot write cancelled");
    const payload = PARSERS.run(snapshot);
    await writeJson(
      this.filePath("run", snapshot.runId),
      payload,
      options?.signal,
      WRITE_CANCELLED,
    );
    await this.upsertIndex(snapshot, options?.signal);
  }

  /** 索引更新：同 runId 只保留一条，按 updatedAt 倒序。 */
  private async upsertIndex(snapshot: RunSnapshot, signal?: AbortSignal): Promise<void> {
    const ledger = await this.readIndex(signal);
    const rest = ledger.runs.filter((run) => run.runId !== snapshot.runId);
    const nextRuns = orderRuns([toListItem(snapshot), ...rest]);
    await writeJson(this.filePath("index"), { runs: nextRuns }, signal, WRITE_CANCELLED);
  }

  private async readIndex(signal?: AbortSignal): Promise<WorkflowIndexFile> {
    const parsed = await readJson(this.filePath("index"), signal, JSON_READ_CANCELLED);
    if (parsed === null) return { runs: [] };
    const candidate = parsed as { runs?: unknown };
    const runs = Array.isArray(candidate.runs) ? (candidate.runs as WorkflowRunListItem[]) : [];
    return { runs };
  }

  /** 文件路径：`kind` 选文件名，`runId` 决定落在 runs 子目录还是根目录。 */
  private filePath(kind: WorkflowFileName, runId?: string): string {
    const base = runId === undefined ? this.rootDir : this.runRoot(runId);
    return join(base, WORKFLOW_FILES[kind]);
  }

  private runRoot(runId: string): string {
    return join(this.rootDir, "runs", sanitizePathSegment(runId));
  }
}

export function createNodeWorkflowStore(options: NodeWorkflowStoreOptions = {}): WorkflowStorePort {
  return new NodeWorkflowStore(options);
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

export class NodeWorkflowDefinitionStore implements WorkflowDefinitionStorePort {
  private readonly definitionsDir: string;

  constructor(options: NodeWorkflowDefinitionStoreOptions = {}) {
    const { definitionsDir, rootDir } = options;
    const base = rootDir ?? DEFAULT_WORKFLOW_ROOT;
    this.definitionsDir = definitionsDir ?? join(base, "definitions");
  }

  async listDefinitions(options?: CallOptions): Promise<WorkflowDefinition[]> {
    throwIfAborted(options?.signal, "Workflow definition list cancelled");
    const definitions: WorkflowDefinition[] = [];
    for (const definitionId of await listDefinitionIds(this.definitionsDir)) {
      const definition = await this.readDefinition(definitionId, options);
      if (definition) definitions.push(definition);
    }
    return definitions;
  }

  async readDefinition(
    definitionId: string,
    options?: CallOptions,
  ): Promise<WorkflowDefinition | null> {
    throwIfAborted(options?.signal, "Workflow definition read cancelled");
    validateDefinitionId(definitionId);
    const target = join(this.definitionsDir, `${definitionId}${DEFINITION_EXTENSION}`);
    const parsed = await readJson(target, options?.signal, JSON_READ_CANCELLED);
    if (parsed === null) return null;
    const definition = PARSERS.definition(parsed);
    if (definition.definitionId === definitionId) return definition;
    const text = `Workflow definition id mismatch: requested ${definitionId}, file declares ${definition.definitionId}`;
    throw new Error(text);
  }
}

export function createNodeWorkflowDefinitionStore(
  options: NodeWorkflowDefinitionStoreOptions = {},
): WorkflowDefinitionStorePort {
  return new NodeWorkflowDefinitionStore(options);
}

export function getDefaultWorkflowRoot(): string {
  return DEFAULT_WORKFLOW_ROOT;
}

export function getDefaultWorkflowDefinitionsRoot(): string {
  return join(DEFAULT_WORKFLOW_ROOT, "definitions");
}
