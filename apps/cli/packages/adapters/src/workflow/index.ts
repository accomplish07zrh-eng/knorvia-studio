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

const DEFINITION_EXTENSION = ".json";
const DEFAULT_WORKFLOW_ROOT = join(resolveKnorviaDataRoot(), "cli", "workflows");

export class NodeWorkflowStore implements WorkflowStorePort {
  private readonly rootDir: string;

  constructor(options: NodeWorkflowStoreOptions = {}) {
    this.rootDir = options.rootDir ?? DEFAULT_WORKFLOW_ROOT;
  }

  async appendEvent(event: WorkflowEvent, options?: CallOptions): Promise<void> {
    throwIfAborted(options?.signal, "Workflow event append cancelled");
    WorkflowEventSchema.parse(event);
    const target = this.filePath("events", event.runId);
    await appendJsonLine(target, event, options?.signal, "Workflow JSONL append cancelled");
  }

  async appendGraphRecord(
    runId: string,
    record: WorkflowGraphRecord,
    options?: CallOptions,
  ): Promise<void> {
    throwIfAborted(options?.signal, "Workflow graph append cancelled");
    WorkflowGraphRecordSchema.parse(record);
    const target = this.filePath("graph", runId);
    await appendJsonLine(target, record, options?.signal, "Workflow JSONL append cancelled");
  }

  async listRuns(
    query: RunQuery = {},
    signalOptions?: CallOptions,
  ): Promise<WorkflowRunListItem[]> {
    throwIfAborted(signalOptions?.signal, "Workflow run list cancelled");
    const ledger = await this.readIndex(signalOptions?.signal);
    const matching = ledger.runs.filter(
      (run) =>
        (query.cwd === undefined || run.cwd === query.cwd) &&
        (query.kind === undefined || run.kind === query.kind),
    );
    const ordered = matching.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return query.limit === undefined ? ordered : ordered.slice(0, query.limit);
  }

  async readEvents(runId: string, options?: CallOptions): Promise<WorkflowEvent[]> {
    throwIfAborted(options?.signal, "Workflow event read cancelled");
    const target = this.filePath("events", runId);
    const lines = await readJsonLines(target, options?.signal, "Workflow JSONL read cancelled");
    return lines.map((line) => WorkflowEventSchema.parse(line));
  }

  async readLatestRun(
    query: { cwd?: string; kind?: WorkflowKind } = {},
    signalOptions?: CallOptions,
  ): Promise<WorkflowRunSnapshot | null> {
    const [latest] = await this.listRuns({ ...query, limit: 1 }, signalOptions);
    if (!latest) return null;
    return await this.readRun(latest.runId, signalOptions);
  }

  async readRun(runId: string, options?: CallOptions): Promise<WorkflowRunSnapshot | null> {
    throwIfAborted(options?.signal, "Workflow snapshot read cancelled");
    const target = this.filePath("run", runId);
    const parsed = await readJson(target, options?.signal, "Workflow JSON read cancelled");
    return parsed === null ? null : WorkflowRunSnapshotSchema.parse(parsed);
  }

  async writeArtifact(
    runId: string,
    relativePath: string,
    content: string,
    options?: CallOptions,
  ): Promise<{ path: string; relativePath: string }> {
    throwIfAborted(options?.signal, "Workflow artifact write cancelled");
    const safeRelativePath = normalizeRelativePath(relativePath);
    const target = join(this.runRoot(runId), safeRelativePath);
    await writeTextAtomic(target, content, options?.signal);
    return { path: target, relativePath: safeRelativePath };
  }

  async writeReport(
    runId: string,
    content: string,
    options?: CallOptions,
  ): Promise<{ path: string; relativePath: string }> {
    return await this.writeArtifact(runId, WORKFLOW_FILES.report, content, options);
  }

  async writeSnapshot(snapshot: WorkflowRunSnapshot, options?: CallOptions): Promise<void> {
    throwIfAborted(options?.signal, "Workflow snapshot write cancelled");
    WorkflowRunSnapshotSchema.parse(snapshot);
    const target = this.filePath("run", snapshot.runId);
    await writeJson(target, snapshot, options?.signal, "Workflow file write cancelled");
    await this.upsertIndex(snapshot, options?.signal);
  }

  /** 索引更新：同 runId 只保留一条，按 updatedAt 倒序。 */
  private async upsertIndex(snapshot: WorkflowRunSnapshot, signal?: AbortSignal): Promise<void> {
    const ledger = await this.readIndex(signal);
    const entry = {} as WorkflowRunListItem;
    entry.completedAt = snapshot.completedAt;
    entry.createdAt = snapshot.createdAt;
    entry.cwd = snapshot.cwd;
    entry.kind = snapshot.kind;
    entry.runId = snapshot.runId;
    entry.status = snapshot.status;
    entry.task = snapshot.task;
    entry.updatedAt = snapshot.updatedAt;

    const rest = ledger.runs.filter((run) => run.runId !== snapshot.runId);
    const nextRuns = [entry, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const target = this.filePath("index");
    await writeJson(target, { runs: nextRuns }, signal, "Workflow file write cancelled");
  }

  private async readIndex(signal?: AbortSignal): Promise<WorkflowIndexFile> {
    const target = this.filePath("index");
    const parsed = await readJson(target, signal, "Workflow JSON read cancelled");
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

export class NodeWorkflowDefinitionStore implements WorkflowDefinitionStorePort {
  private readonly definitionsDir: string;

  constructor(options: NodeWorkflowDefinitionStoreOptions = {}) {
    const base = options.rootDir ?? DEFAULT_WORKFLOW_ROOT;
    this.definitionsDir = options.definitionsDir ?? join(base, "definitions");
  }

  async listDefinitions(options?: CallOptions): Promise<WorkflowDefinition[]> {
    throwIfAborted(options?.signal, "Workflow definition list cancelled");
    const names = await listDefinitionFiles(this.definitionsDir);
    const definitionIds = names
      .filter((name) => extname(name) === DEFINITION_EXTENSION)
      .map((name) => parse(name).name)
      .sort((a, b) => a.localeCompare(b));

    const definitions: WorkflowDefinition[] = [];
    for (const definitionId of definitionIds) {
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
    const parsed = await readJson(target, options?.signal, "Workflow JSON read cancelled");
    if (parsed === null) return null;
    const definition = WorkflowDefinitionSchema.parse(parsed);
    if (definition.definitionId !== definitionId) {
      const requested = definitionId;
      const declared = definition.definitionId;
      const text = `Workflow definition id mismatch: requested ${requested}, file declares ${declared}`;
      throw new Error(text);
    }
    return definition;
  }
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

/** 产物写入：临时文件 + rename，避免读到半截内容。 */
async function writeTextAtomic(
  target: string,
  content: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  await writeText(target, content, signal, "Workflow file write cancelled", "replace");
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
