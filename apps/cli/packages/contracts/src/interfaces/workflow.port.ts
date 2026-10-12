// SPDX-License-Identifier: Apache-2.0
// 工作流端口：把一次后台工作流交给工作流运行时，之后按 taskId 追问它跑到哪儿了。
// 启动入参在工具输入之上补齐路由身份与工作区边界；任务快照归运行时所有——runId、状态迁移
// 与「什么时候算完成」都由它决定，调用方只读不写。

// ── 章节：一 任务状态与快照 · 二 启动入参与选项 · 三 端口本体

import type { TraceContext } from "../tracing/tracer.js";
import type { WorkflowInput, WorkflowOutput } from "../tools/workflow.js";
import type { SessionId, ToolCallId, TurnId } from "./shared.js";

// ── 一、任务状态与快照 ──────────────────────────────────────────────

/** 后台工作流的公开状态；`lost` 指记录已无法追认，绝不等于成功。 */
export type WorkflowTaskStatus = "running" | "completed" | "failed" | "cancelled" | "lost";

/** 一次工作流任务的快照，由运行时在查询与等待时产出。`taskId` 是查询句柄，`runId` 标识本次 运行；名称与描述来自工作流定义，输出与错误则描述它的结局。 */
export interface WorkflowTaskSnapshot {
  completedAt?: Date;
  description?: string;
  error?: string;
  name?: string;
  output?: WorkflowOutput;
  runId: string;
  startedAt: Date;
  status: WorkflowTaskStatus;
  taskId: string;
}

// ── 二、启动入参与选项 ──────────────────────────────────────────────

/** 启动选项：目前只有取消入口。 */
export interface WorkflowStartOptions {
  signal?: AbortSignal;
}

/** 启动一次工作流。除了工具输入（见 {@link WorkflowInput}），发起方还要交代归属会话、父 tool call、trace 与工作区边界，运行时据此登记后台任务。 */
export interface WorkflowStartRequest extends WorkflowInput {
  parentToolCallId: ToolCallId | string;
  sessionId: SessionId;
  trace: TraceContext;
  turnId?: TurnId;
  workingDirectory: string;
  workspaceRoot: string;
}

// ── 三、端口本体 ────────────────────────────────────────────────────

/** 工作流运行时对外的能力面：`start` 为必备，任务查询与等待可选。 */
export interface WorkflowPort {
  start(request: WorkflowStartRequest, options?: WorkflowStartOptions): Promise<WorkflowOutput>;
  getTask?(taskId: string): Promise<WorkflowTaskSnapshot | undefined>;
  waitForTask?(
    taskId: string,
    options?: { signal?: AbortSignal },
  ): Promise<WorkflowTaskSnapshot | undefined>;
}
