// SPDX-License-Identifier: Apache-2.0
// 工作流提交端口：actor 交出自己的结构化终态结果，由引擎裁决接受、或退回让它改。
// 与 {@link WorkflowEscalatePort} 是两条独立时序：这里结算的是引擎对结果的裁决，不是问答。

// ── 章节：一 裁决语汇 · 二 违规明细与提交入参 · 三 端口本体

import type { TraceContext } from "../tracing/tracer.js";
import type { ToolCallId } from "./shared.js";

// ── 一、裁决语汇 ────────────────────────────────────────────────────

/** 引擎接受本次提交：actor 这一轮应当在结果返回后终止。 */
export interface SubmitAccepted {
  accept: true;
}

/** 引擎拒绝本次提交：带上违规列表，模型可以在同一会话里改完再交。 */
export interface SubmitRejected {
  accept: false;
  violations: readonly SubmitViolation[];
}

/** 裁决的判别联合，消费方按 `accept` 分支处理。 */
export type SubmitVerdict = SubmitAccepted | SubmitRejected;

// ── 二、违规明细与提交入参 ──────────────────────────────────────────

/** 校验器给出的单条违规，形态上能直接塞进修复用的 tool_result：一行一条，带上 JSON 路径、 期望取值的描述与实际取值的描述。 结构与 dynamic-workflow 合成侧的 Violation 对齐；由 driver 负责把引擎的违规原样映射到本 端口，contracts 不反向依赖 dynamic-workflow。 */
export interface SubmitViolation {
  /** 违规位置的 JSON 路径，形如 `$`、`$.foo`、`$.items[0]`。 */
  path: string;
  /** 期望形状或取值的简短描述。 */
  expected: string;
  /** 实际拿到的值的简短描述。 */
  got: string;
}

/** 提交请求：模型给出的原始 JSON 结果，本端口不做预校验。 */
export interface SubmitResultRequest {
  /** 发起 submit_result 调用的 actor 子会话内的 tool call id。 */
  toolCallId: ToolCallId | string;
  /** 模型提交的原始结构化结果（未经本端口校验的任意 JSON）。 */
  result: unknown;
  trace: TraceContext;
}

// ── 三、端口本体 ────────────────────────────────────────────────────

/** 提交能力。`respond` 阻塞到引擎给出裁决为止：引擎可能在带外跑多轮修复与预算判定，耗时没有 上限。取消不在本端口表达，而是中止该 tool call（abort），由 driver 把带外的 ask 取消转成 turn abort。 instance / actor / session 这些路由身份由端口 closure 绑定，模型覆盖不了。 */
export interface WorkflowSubmitPort {
  respond(request: SubmitResultRequest): Promise<SubmitVerdict>;
}
