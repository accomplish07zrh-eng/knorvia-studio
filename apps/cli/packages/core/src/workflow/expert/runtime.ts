// SPDX-License-Identifier: Apache-2.0
// 专家工作流运行时：对外命令入口；实现与结果构造见 runtime-runs.ts。
import { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import {
  cancelRunCommand,
  eventsOf,
  listOf,
  resumeRun,
  retryRun,
  startRun,
  startRunInBackground,
  statusOf,
} from "./runtime-runs.js";
import type {
  ExpertWorkflowCommandResult,
  ExpertWorkflowEventsOptions,
  ExpertWorkflowListOptions,
  ExpertWorkflowLookupOptions,
  ExpertWorkflowRetryOptions,
  ExpertWorkflowRunOptions,
  ExpertWorkflowRuntimeDeps,
} from "./types.js";
import type {
  SessionEvent,
  TraceContext,
  WorkflowEvent,
  WorkflowRunListItem,
} from "@knorvia/contracts";

type Command = ExpertWorkflowCommandResult;
type ResumeInput = ExpertWorkflowLookupOptions & {
  onEvent?: (event: SessionEvent) => void | Promise<void>;
  traceContext?: TraceContext;
};

/** 专家工作流运行时：持有上下文，把每条命令分派给 runtime-runs.ts。 */
export class ExpertWorkflowRuntime {
  private readonly ctx: ExpertWorkflowRuntimeContext;

  constructor(runtimeDeps: ExpertWorkflowRuntimeDeps) {
    this.ctx = new ExpertWorkflowRuntimeContext(runtimeDeps);
  }

  /** 前台启动：写初始快照与图，注册取消信号后跑完整循环。 */
  async start(input: ExpertWorkflowRunOptions): Promise<Command> {
    return await startRun(this.ctx, input);
  }

  /** 后台启动：立即返回 running，运行在后台继续，失败仅记事件。 */
  async startBackground(input: ExpertWorkflowRunOptions): Promise<Command> {
    return await startRunInBackground(this.ctx, input);
  }

  /** 恢复：终态直接回状态，否则修复陈旧活动后继续。 */
  async resume(input: ResumeInput): Promise<Command> {
    return await resumeRun(this.ctx, input);
  }

  /** 状态查询：返回格式化状态与报告路径。 */
  async status(input: ExpertWorkflowLookupOptions): Promise<Command> {
    return await statusOf(this.ctx, input);
  }

  /** 重试：完成/取消直接回状态，否则重置失败节点后继续。 */
  async retry(input: ExpertWorkflowRetryOptions): Promise<Command> {
    return await retryRun(this.ctx, input);
  }

  /** 取消：修复快照、落盘、发事件，并中止正在运行的控制器。 */
  async cancel(input: ExpertWorkflowLookupOptions): Promise<Command> {
    return await cancelRunCommand(this.ctx, input);
  }

  /** 列表：按工作区与类型列出运行。 */
  async list(input: ExpertWorkflowListOptions): Promise<WorkflowRunListItem[]> {
    return await listOf(this.ctx, input);
  }

  /** 事件：按 runId 读取，limit 为从尾部截取的数量。 */
  async events(input: ExpertWorkflowEventsOptions): Promise<WorkflowEvent[]> {
    return await eventsOf(this.ctx, input);
  }
}

export { ExpertWorkflowRuntime as WorkflowRuntime };
