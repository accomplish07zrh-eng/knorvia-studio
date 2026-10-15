// SPDX-License-Identifier: Apache-2.0
// 工作流存储门面：类壳只保留字段与 port 方法签名，行为全部委托给内部模块。
// ——————————————————————————————
// 下面按职责列出各内部模块；本文件本身不含实现。
// 模块地图（本文件只有 8 个声明、0 条 re-export，方法体均为一行转发）：
// - store-ops.ts  各 port 方法体（校验、索引、工件写入、定义读取）
// - json-io.ts    文本/JSON/JSONL 读取与「追加或原子替换」写入
// - path-rules.ts 固定文件名、相对路径越界判定、id 合法性与取消检查
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { join } from "node:path";
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
  appendEventOp,
  appendGraphOp,
  definitionsDirectory,
  listDefinitionsOp,
  listRunsOp,
  readDefinitionOp,
  readEventsOp,
  readRunOp,
  writeArtifactOp,
  writeSnapshotOp,
} from "./store-ops.js";

export interface NodeWorkflowStoreOptions {
  rootDir?: string;
}

export interface NodeWorkflowDefinitionStoreOptions {
  definitionsDir?: string;
  rootDir?: string;
}

type CallOptions = { signal?: AbortSignal } | undefined;
type RunQuery = { cwd?: string; kind?: WorkflowKind; limit?: number };
type RunSnapshot = WorkflowRunSnapshot;
type GraphRecord = WorkflowGraphRecord;
type ArtifactRef = { path: string; relativePath: string };

const DEFAULT_WORKFLOW_ROOT = join(resolveKnorviaDataRoot(), "cli", "workflows");

export class NodeWorkflowStore implements WorkflowStorePort {
  private readonly rootDir: string;

  constructor(options: NodeWorkflowStoreOptions = {}) {
    const { rootDir } = options;
    this.rootDir = rootDir ?? DEFAULT_WORKFLOW_ROOT;
  }

  async appendEvent(event: WorkflowEvent, options?: CallOptions): Promise<void> {
    await appendEventOp(this.rootDir, event, options?.signal, "Workflow event append cancelled");
  }

  async appendGraphRecord(
    runId: string,
    record: GraphRecord,
    options?: CallOptions,
  ): Promise<void> {
    await appendGraphOp(
      this.rootDir,
      runId,
      record,
      options?.signal,
      "Workflow graph append cancelled",
    );
  }

  async listRuns(query: RunQuery = {}, options?: CallOptions): Promise<WorkflowRunListItem[]> {
    return await listRunsOp(this.rootDir, query, options?.signal, "Workflow run list cancelled");
  }

  async readEvents(runId: string, options?: CallOptions): Promise<WorkflowEvent[]> {
    return await readEventsOp(
      this.rootDir,
      runId,
      options?.signal,
      "Workflow event read cancelled",
    );
  }

  async readLatestRun(
    query: { cwd?: string; kind?: WorkflowKind } = {},
    options?: CallOptions,
  ): Promise<RunSnapshot | null> {
    const [latest] = await this.listRuns({ ...query, limit: 1 }, options);
    if (!latest) return null;
    return await this.readRun(latest.runId, options);
  }

  async readRun(runId: string, options?: CallOptions): Promise<RunSnapshot | null> {
    return await readRunOp(
      this.rootDir,
      runId,
      options?.signal,
      "Workflow snapshot read cancelled",
    );
  }

  async writeArtifact(
    runId: string,
    relativePath: string,
    content: string,
    options?: CallOptions,
  ): Promise<ArtifactRef> {
    return await writeArtifactOp(
      this.rootDir,
      runId,
      relativePath,
      content,
      options?.signal,
      "Workflow artifact write cancelled",
    );
  }

  async writeReport(runId: string, content: string, options?: CallOptions): Promise<ArtifactRef> {
    return await this.writeArtifact(runId, "report.md", content, options);
  }

  async writeSnapshot(snapshot: RunSnapshot, options?: CallOptions): Promise<void> {
    await writeSnapshotOp(
      this.rootDir,
      snapshot,
      options?.signal,
      "Workflow snapshot write cancelled",
    );
  }
}

export function createNodeWorkflowStore(options: NodeWorkflowStoreOptions = {}): WorkflowStorePort {
  return new NodeWorkflowStore(options);
}

export class NodeWorkflowDefinitionStore implements WorkflowDefinitionStorePort {
  private readonly definitionsDir: string;

  constructor(options: NodeWorkflowDefinitionStoreOptions = {}) {
    const { definitionsDir, rootDir } = options;
    const base = rootDir ?? DEFAULT_WORKFLOW_ROOT;
    this.definitionsDir = definitionsDir ?? definitionsDirectory(base);
  }

  async listDefinitions(options?: CallOptions): Promise<WorkflowDefinition[]> {
    return await listDefinitionsOp(
      this.definitionsDir,
      options?.signal,
      "Workflow definition list cancelled",
    );
  }

  async readDefinition(
    definitionId: string,
    options?: CallOptions,
  ): Promise<WorkflowDefinition | null> {
    return await readDefinitionOp(
      this.definitionsDir,
      definitionId,
      options?.signal,
      "Workflow definition read cancelled",
    );
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
  return definitionsDirectory(DEFAULT_WORKFLOW_ROOT);
}

// 本文件对外只承诺下面这些名字，其余都是实现细节：
// 1) NodeWorkflowStoreOptions / NodeWorkflowDefinitionStoreOptions —— 构造入参（rootDir、definitionsDir）；
// 2) NodeWorkflowStore —— 事件追加、图记录追加、运行列表、事件读取、最新快照、快照读取、工件写入、
//    报告写入、快照写入（含索引更新）；
// 3) NodeWorkflowDefinitionStore —— 定义列表与单定义读取（id 与文件名不一致时抛错）；
// 4) createNodeWorkflowStore / createNodeWorkflowDefinitionStore —— 两个工厂，返回 port 接口；
// 5) getDefaultWorkflowRoot / getDefaultWorkflowDefinitionsRoot —— 默认目录解析。
// ——————————————————————————————
// 约定：
// - 所有方法都接受 `{ signal }` 选项，取消优先透传 `signal.reason`；
// - 事件与图记录以 JSONL 追加，快照与索引以「临时文件 + rename」原子替换；
// - runId 进目录名之前会做字符净化，工件相对路径必须落在 run 目录内；
// - 定义目录不存在按「没有定义」处理（返回空列表），其余 IO 错误照常上抛；
// - 定义 id 必须与文件名一致，不一致时抛错而不是静默采用文件内容；
// - 方法体全部委托给内部模块，因此本文件没有 IO 实现，只有签名与转发。
//   这么做的原因：门面文件只承诺接口形状，行为改动集中在 store-ops 便于独立验证。
