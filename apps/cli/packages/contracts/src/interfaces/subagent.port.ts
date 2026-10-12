// SPDX-License-Identifier: Apache-2.0
// 子代理端口：父 Agent Loop 与 Core Server 借它启动 child agent、投递消息、观察后台任务。
// 这里只摆边界上的语汇；child 的进程、会话与模型生命周期都归实现方（子代理运行时）所有，
// 调用方不越过端口去碰实现细节。

// 组织方式：请求载体单独成组，与调用选项分开；投递语汇、后台任务快照依次排开，端口本尊收尾。
// ── 章节：一 请求载体 · 二 调用选项 · 三 投递语汇 · 四 后台任务快照 · 五 端口本体

import type { ModelRequestDependencies } from "../model/invocation-context.js";
import type { Model, ModelSelection } from "../model/index.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { AgentBackgroundedOutput, AgentOutput } from "../tools/agent.js";
import type { SessionId, ToolCallId, TurnId } from "./shared.js";

// ── 一、请求载体：发起方要交代的事实 ────────────────────────────────

/** 一次 child 运行的完整入参。归属会话、父 tool call 与 trace 由发起方填写，child 在给定的 工作目录与工作区根下执行模型面向的 prompt；`callerCanReadOutputFile` 表示发起方是否有权 读回 child 的输出文件。 */
export interface SubagentRunRequest {
  sessionId: SessionId;
  turnId?: TurnId;
  parentToolCallId: ToolCallId | string;
  agentType: string;
  description: string;
  prompt: string;
  callerCanReadOutputFile?: boolean;
  workingDirectory: string;
  workspaceRoot: string;
  trace: TraceContext;
}

/** 在 {@link SubagentRunRequest} 之上追加「这次要不要放进后台」的启动请求。 */
export interface SubagentLaunchRequest extends SubagentRunRequest {
  runInBackground?: boolean;
}

/** `start` 路径的入参；与 `run` 共用同一份事实，只是走另一套选项。 */
export type SubagentStartRequest = SubagentRunRequest;

/** 向既有 child 投递一条消息。`to` 与 `summary` 供接收方和日志定位，`message` 原样送达； 工作区边界随消息一起传递，免得接收方自行推断。 */
export interface SubagentSendMessageRequest {
  sessionId: SessionId;
  turnId?: TurnId;
  parentToolCallId: ToolCallId | string;
  to: string;
  summary: string;
  message: string;
  workingDirectory: string;
  workspaceRoot: string;
  trace: TraceContext;
}

// ── 二、调用选项：与请求正交的运行开关 ──────────────────────────────

/** `run` 的运行选项。未显式选模的 child 继承父 Agent Loop 交下来的不可变 Model；Core Server 还能对前台 child 施加更高优先级的选取，但选取结果不得进入后台。 */
export interface SubagentRunOptions {
  signal?: AbortSignal;
  model?: Model;
  modelOverride?: {
    selection: ModelSelection;
    requestDependencies?: ModelRequestDependencies;
    background: "deny";
  };
}

/** `launch` 与 `run` 共用同一份运行选项。 */
export type SubagentLaunchOptions = SubagentRunOptions;

/** `start` 的选项。后台 child 只能继承普通 Model，临时 turn 模型按设计不许进后台； 取消统一由 `signal` 表达。 */
export interface SubagentStartOptions {
  signal?: AbortSignal;
  model?: Model;
}

/** 投递消息时的取消入口。 */
export interface SubagentSendMessageOptions {
  signal?: AbortSignal;
}

/** 请求停止某个后台任务时的取消入口。 */
export interface SubagentStopOptions {
  signal?: AbortSignal;
}

/** 等待后台任务落定期间的取消入口。 */
export interface SubagentWaitOptions {
  signal?: AbortSignal;
}

// ── 三、投递语汇：消息被怎么接住，以及投递结果 ──────────────────────

/** 消息实际被 child 接住的方式：排队、当场转向，或把后台任务唤醒后再送。 */
export type SubagentSendMessageDelivery = "queued" | "steered" | "resumed_background";

/** 投递结果。`messageId` 成败都给出，便于两侧记录对账；其余字段按需出现——投递方式、 面向模型的说明、错误文本，以及关联到的 agent / 任务 / 输出文件。 */
export interface SubagentSendMessageResult {
  status: "success" | "failed";
  messageId: string;
  delivery?: SubagentSendMessageDelivery;
  message?: string;
  error?: string;
  agentId?: string;
  taskId?: string;
  outputFile?: string;
}

// ── 四、后台任务快照：任务此刻的公开状态 ────────────────────────────

/** 后台任务的生命周期状态；`lost` 指记录已无法追认，不代表任务成功。 */
export type SubagentTaskStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "killed"
  | "stopped"
  | "lost";

/** 某个后台 task 的快照，由子代理运行时在查询或等待时产出。身份字段（taskId / agentId / parentToolCallId / childSessionId）把任务挂回调用链，时间戳、pid、输出与错误描述它的实际 进展，`notified` 标记完成通知是否已经发出。 */
export interface SubagentTaskSnapshot {
  taskId: string;
  agentId: string;
  agentType: string;
  description: string;
  status: SubagentTaskStatus;
  startedAt: Date;
  completedAt?: Date;
  childSessionId?: SessionId;
  parentToolCallId?: ToolCallId | string;
  pid?: number;
  error?: string;
  output?: AgentOutput;
  outputFile?: string;
  notified?: boolean;
}

// ── 五、端口本体：实现方承诺的能力面 ────────────────────────────────

/** 子代理运行时对外承诺的入口。`launch` / `run` 是必经路径；`start` 与它的后台任务四件套 （查询、等待、停止，外加 sendMessage）标为可选，只有具备后台能力的实现才提供。 */
export interface SubagentPort {
  launch(request: SubagentLaunchRequest, options?: SubagentLaunchOptions): Promise<AgentOutput>;
  run(request: SubagentRunRequest, options?: SubagentRunOptions): Promise<AgentOutput>;
  start?(
    request: SubagentStartRequest,
    options?: SubagentStartOptions,
  ): Promise<AgentBackgroundedOutput>;
  backgroundTask?(taskId: string): Promise<SubagentTaskSnapshot | undefined>;
  getTask?(taskId: string): Promise<SubagentTaskSnapshot | undefined>;
  waitForTask?(
    taskId: string,
    options?: SubagentWaitOptions,
  ): Promise<SubagentTaskSnapshot | undefined>;
  stopTask?(
    taskId: string,
    options?: SubagentStopOptions,
  ): Promise<SubagentTaskSnapshot | undefined>;
  sendMessage?(
    request: SubagentSendMessageRequest,
    options?: SubagentSendMessageOptions,
  ): Promise<SubagentSendMessageResult>;
}
