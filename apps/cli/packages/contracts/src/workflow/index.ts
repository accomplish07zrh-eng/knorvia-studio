// SPDX-License-Identifier: Apache-2.0
// workflow 区的公开入口：把 script / definition / graph / run / scheduler-state / session-links
// 的定义面原样汇到一起，另外声明两个**存储端口**（运行记录与定义），
// 让上层只依赖接口，不依赖具体存储实现。
import {
  type WorkflowKind,
  type WorkflowRunStatus,
  type WorkflowDefinition,
} from "./definition.js";
import {
  type WorkflowEvent,
  type WorkflowGraphRecord,
  type WorkflowRunSnapshot,
} from "./run-schema.js";

export * from "./script.js";
export * from "./definition.js";
export * from "./graph-schema.js";
export * from "./run-schema.js";
export * from "./scheduler-state.js";
export * from "./session-links.js";

// 列表项刻意是扁平的：一条 run 在列表里要画的就是这几个字段。
export interface WorkflowRunListItem {
  completedAt?: string;
  createdAt: string;
  cwd: string;
  kind: WorkflowKind;
  runId: string;
  status: WorkflowRunStatus;
  task: string;
  updatedAt: string;
}

// 运行记录的读写端口：事件、图记录、快照与产物都经这里进出；每个方法都接受
// AbortSignal，取消要让调用方看得见。
export interface WorkflowStorePort {
  appendEvent(event: WorkflowEvent, options?: { signal?: AbortSignal }): Promise<void>;
  appendGraphRecord(
    runId: string,
    record: WorkflowGraphRecord,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  listRuns(
    options?: { cwd?: string; kind?: WorkflowKind; limit?: number },
    signalOptions?: { signal?: AbortSignal },
  ): Promise<WorkflowRunListItem[]>;
  readEvents(runId: string, options?: { signal?: AbortSignal }): Promise<WorkflowEvent[]>;
  readLatestRun(
    options?: { cwd?: string; kind?: WorkflowKind },
    signalOptions?: { signal?: AbortSignal },
  ): Promise<WorkflowRunSnapshot | null>;
  readRun(runId: string, options?: { signal?: AbortSignal }): Promise<WorkflowRunSnapshot | null>;
  writeArtifact(
    runId: string,
    relativePath: string,
    content: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ path: string; relativePath: string }>;
  writeReport(
    runId: string,
    content: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ path: string; relativePath: string }>;
  writeSnapshot(snapshot: WorkflowRunSnapshot, options?: { signal?: AbortSignal }): Promise<void>;
}

// 定义（脚本/图）的只读端口：列表与按 id 读取，缺定义时返回 null 而不是抛错。
export interface WorkflowDefinitionStorePort {
  listDefinitions(options?: { signal?: AbortSignal }): Promise<WorkflowDefinition[]>;
  readDefinition(
    definitionId: string,
    options?: { signal?: AbortSignal },
  ): Promise<WorkflowDefinition | null>;
}
