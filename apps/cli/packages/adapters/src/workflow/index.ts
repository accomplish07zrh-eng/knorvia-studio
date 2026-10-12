// SPDX-License-Identifier: Apache-2.0
// 工作流存储：事件/图的 JSONL 追加、快照与索引的原子写、定义目录的读取。
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, normalize, parse } from "node:path";
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

/** 可传取消信号的调用选项：与 port 声明的 `{ signal? }` 结构等价，仅用于压缩签名。 */
type CallOptions = { signal?: AbortSignal } | undefined;

/** 目录内的固定文件名：改名或换布局时只需改这一处。 */
const FILES = {
  events: "events.jsonl",
  graph: "graph.jsonl",
  index: "index.json",
  report: "report.md",
  run: "run.json",
} as const;

const DEFINITION_EXTENSION = ".json";
const DEFAULT_WORKFLOW_ROOT = join(resolveKnorviaDataRoot(), "cli", "workflows");
const ID_PATTERN = /^[a-zA-Z0-9._-]+$/u;
const PARENT_REFERENCE = /(?:^|[/\\])\.\.(?:[/\\]|$)/u;
const RESERVED_IDS: ReadonlySet<string> = new Set([".", ".."]);

export class NodeWorkflowStore implements WorkflowStorePort {
  private readonly rootDir: string;

  constructor(options: NodeWorkflowStoreOptions = {}) {
    this.rootDir = options.rootDir ?? DEFAULT_WORKFLOW_ROOT;
  }

  async appendEvent(event: WorkflowEvent, options?: CallOptions): Promise<void> {
    throwIfAborted(options?.signal, "Workflow event append cancelled");
    WorkflowEventSchema.parse(event);
    await appendJsonLine(this.eventsPath(event.runId), event, options?.signal);
  }

  async appendGraphRecord(
    runId: string,
    record: WorkflowGraphRecord,
    options?: CallOptions,
  ): Promise<void> {
    throwIfAborted(options?.signal, "Workflow graph append cancelled");
    WorkflowGraphRecordSchema.parse(record);
    await appendJsonLine(this.graphPath(runId), record, options?.signal);
  }

  async listRuns(
    options: { cwd?: string; kind?: WorkflowKind; limit?: number } = {},
    signalOptions?: CallOptions,
  ): Promise<WorkflowRunListItem[]> {
    throwIfAborted(signalOptions?.signal, "Workflow run list cancelled");
    const ledger = await this.readIndex(signalOptions?.signal);
    const matching = ledger.runs.filter(
      (run) =>
        (options.cwd === undefined || run.cwd === options.cwd) &&
        (options.kind === undefined || run.kind === options.kind),
    );
    const ordered = matching.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return options.limit === undefined ? ordered : ordered.slice(0, options.limit);
  }

  async readEvents(runId: string, options?: CallOptions): Promise<WorkflowEvent[]> {
    throwIfAborted(options?.signal, "Workflow event read cancelled");
    const lines = await readJsonLines(this.eventsPath(runId), options?.signal);
    return lines.map((line) => WorkflowEventSchema.parse(line));
  }

  async readLatestRun(
    options: { cwd?: string; kind?: WorkflowKind } = {},
    signalOptions?: CallOptions,
  ): Promise<WorkflowRunSnapshot | null> {
    const [latest] = await this.listRuns({ ...options, limit: 1 }, signalOptions);
    if (!latest) return null;
    return await this.readRun(latest.runId, signalOptions);
  }

  async readRun(runId: string, options?: CallOptions): Promise<WorkflowRunSnapshot | null> {
    throwIfAborted(options?.signal, "Workflow snapshot read cancelled");
    const parsed = await readJson(this.snapshotPath(runId), options?.signal);
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
    await writeTextFile(target, content, options?.signal);
    return { path: target, relativePath: safeRelativePath };
  }

  async writeReport(
    runId: string,
    content: string,
    options?: CallOptions,
  ): Promise<{ path: string; relativePath: string }> {
    return await this.writeArtifact(runId, FILES.report, content, options);
  }

  async writeSnapshot(snapshot: WorkflowRunSnapshot, options?: CallOptions): Promise<void> {
    throwIfAborted(options?.signal, "Workflow snapshot write cancelled");
    WorkflowRunSnapshotSchema.parse(snapshot);
    await writeJsonFile(this.snapshotPath(snapshot.runId), snapshot, options?.signal);
    await this.upsertIndex(snapshot, options?.signal);
  }

  /** 索引更新：同 runId 只保留一条，按 updatedAt 倒序。 */
  private async upsertIndex(snapshot: WorkflowRunSnapshot, signal?: AbortSignal): Promise<void> {
    const ledger = await this.readIndex(signal);
    const entry: WorkflowRunListItem = {
      completedAt: snapshot.completedAt,
      createdAt: snapshot.createdAt,
      cwd: snapshot.cwd,
      kind: snapshot.kind,
      runId: snapshot.runId,
      status: snapshot.status,
      task: snapshot.task,
      updatedAt: snapshot.updatedAt,
    };
    const rest = ledger.runs.filter((run) => run.runId !== snapshot.runId);
    const nextRuns = [entry, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await writeJsonFile(this.indexPath(), { runs: nextRuns }, signal);
  }

  private async readIndex(signal?: AbortSignal): Promise<WorkflowIndexFile> {
    const parsed = await readJson(this.indexPath(), signal);
    if (parsed === null) return { runs: [] };
    const candidate = parsed as { runs?: unknown };
    return { runs: Array.isArray(candidate.runs) ? (candidate.runs as WorkflowRunListItem[]) : [] };
  }

  private eventsPath(runId: string): string {
    return join(this.runRoot(runId), FILES.events);
  }

  private graphPath(runId: string): string {
    return join(this.runRoot(runId), FILES.graph);
  }

  private indexPath(): string {
    return join(this.rootDir, FILES.index);
  }

  private runRoot(runId: string): string {
    return join(this.rootDir, "runs", sanitizePathSegment(runId));
  }

  private snapshotPath(runId: string): string {
    return join(this.runRoot(runId), FILES.run);
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
    const entries = await this.listDefinitionFiles(options?.signal);
    const definitionIds = entries
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
    const parsed = await readJson(this.definitionPath(definitionId), options?.signal);
    if (parsed === null) return null;
    const definition = WorkflowDefinitionSchema.parse(parsed);
    if (definition.definitionId !== definitionId) {
      const text = `Workflow definition id mismatch: requested ${definitionId}, file declares ${definition.definitionId}`;
      throw new Error(text);
    }
    return definition;
  }

  /** 定义目录缺失按「没有定义」处理，其余错误继续上抛。 */
  private async listDefinitionFiles(signal?: AbortSignal): Promise<string[]> {
    try {
      return await readdir(this.definitionsDir);
    } catch (cause) {
      if (isNodeError(cause) && cause.code === "ENOENT") return [];
      throw cause;
    }
  }

  private definitionPath(definitionId: string): string {
    return join(this.definitionsDir, `${definitionId}${DEFINITION_EXTENSION}`);
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

async function appendJsonLine(target: string, value: unknown, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal, "Workflow JSONL append cancelled");
  await mkdir(dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(value)}\n`, "utf8");
}

/** 读取文本；文件不存在返回 null（调用方决定空值与错误的区别）。 */
async function readTextOrNull(
  target: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<string | null> {
  throwIfAborted(signal, cancelled);
  try {
    return await readFile(target, "utf8");
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") return null;
    throw cause;
  }
}

async function readJson(target: string, signal?: AbortSignal): Promise<unknown | null> {
  const content = await readTextOrNull(target, signal, "Workflow JSON read cancelled");
  return content === null ? null : JSON.parse(content);
}

/** JSONL：跳过空行，逐行解析。 */
function parseJsonLines(content: string): unknown[] {
  const rows = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  return rows.map((line) => JSON.parse(line));
}

async function readJsonLines(target: string, signal?: AbortSignal): Promise<unknown[]> {
  const content = await readTextOrNull(target, signal, "Workflow JSONL read cancelled");
  return content === null ? [] : parseJsonLines(content);
}

async function writeJsonFile(target: string, value: unknown, signal?: AbortSignal): Promise<void> {
  await writeTextFile(target, `${JSON.stringify(value, null, 2)}\n`, signal);
}

/** 原子写：先写临时文件再 rename，避免读到半截文件。 */
async function writeTextFile(target: string, content: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal, "Workflow file write cancelled");
  await mkdir(dirname(target), { recursive: true });
  const staging = `${target}.${randomUUID()}.tmp`;
  await writeFile(staging, content, "utf8");
  await rename(staging, target);
}

/** 产物路径必须落在 run 目录内：拒绝绝对路径与任何 `..` 片段。 */
function normalizeRelativePath(value: string): string {
  const normalized = normalize(value);
  const escapes = isAbsolute(normalized) || PARENT_REFERENCE.test(normalized);
  if (escapes) {
    const text = `Workflow artifact path must stay inside the run directory: ${value}`;
    throw new Error(text);
  }
  return normalized;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

function isFileSafeId(value: string): boolean {
  if (value.length === 0 || RESERVED_IDS.has(value)) return false;
  if (value.includes("/") || value.includes("\\")) return false;
  return normalize(value) === value && ID_PATTERN.test(value);
}

function validateDefinitionId(value: string): void {
  if (isFileSafeId(value)) return;
  throw new Error(`Workflow definition id must be a file-safe name: ${value}`);
}

/** 取消检查：优先透传 `signal.reason`，否则用调用方给的兜底文案。 */
function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error(message);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
