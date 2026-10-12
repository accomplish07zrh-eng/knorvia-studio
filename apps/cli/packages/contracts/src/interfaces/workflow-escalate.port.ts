// SPDX-License-Identifier: Apache-2.0
// 工作流升级端口：actor 子会话把卡住它的单个问题交给主代理，并等一个答复。
// 与 {@link WorkflowSubmitPort} 形状相近却刻意分家：submit 结算的是引擎对终态结果的裁决，
// escalate 结算的是一次问答；对端、生命周期与失败形态都不同，合并会让两条时序互相纠缠。

// ── 章节：一 一次升级的结局 · 二 提问入参 · 三 端口本体

import type { TraceContext } from "../tracing/tracer.js";
import type { ToolCallId } from "./shared.js";

// ── 一、一次升级的结局 ──────────────────────────────────────────────

/** 升级的结局。两支都以普通工具结果的形式回到 actor，不作为错误抛出：预算用尽时应当交回 「自行推进」的正常结果，抛错会让模型把它看成可重试的故障，反复撞同一面墙。 用判别式而非一段文本，是因为消费方（core 的工具处理器）要按 kind 决定 tool_result 的 呈现方式——流程判断靠稳定的码，不靠文案。 */
export type WorkflowEscalateOutcome =
  | {
      kind: "answered";
      /** 主代理经 `ResolveWorkflowQuestion` 给出的答案原文，直接成为工具结果。 */
      answer: string;
      /** 本次问答的全局唯一 id，供日志与人工追溯；模型不需要读它。 */
      qid: string;
    }
  | {
      kind: "refused";
      /** `budget_exhausted`：本次 ask 允许的升级次数已用尽（per-ask 上限，与 nudge 预算同族）。 `no_active_ask`：此刻本会话没有在飞的 ask，问题无处停驻——不该发生，但绝不悬挂。 */
      reason: "budget_exhausted" | "no_active_ask";
      /** 面向模型的说明，陈述现状与下一步。 */
      message: string;
    };

// ── 二、提问入参 ────────────────────────────────────────────────────

/** 一次升级请求：一个聚焦到能一句话回答的问题，外加 actor 已经试过的上下文。 */
export interface EscalateQuestionRequest {
  /** 发起 `escalate` 调用的 actor 子会话内的 tool call id。 */
  toolCallId: ToolCallId | string;
  /** 阻塞点本身。 */
  question: string;
  /** 可选的补充说明：actor 试过什么、卡在哪一行。 */
  context?: string;
  trace: TraceContext;
}

// ── 三、端口本体 ────────────────────────────────────────────────────

// 工作流升级能力。 `escalate` 会一直阻塞到主代理作答或升级被拒； 按设计不设超时——「超时后 自行判断」正是本特性要消灭的投机绕过。
// 出口是现成的取消链路：driver 的 `cancelAsk` 会把停驻 中的升级一并拒绝，因此 run cancel 与进程亡故的表现和改动前保持不变。
// run / actor / session / instance 这些路由身份由端口 closure 绑定，模型覆盖不了。
export interface WorkflowEscalatePort {
  escalate(request: EscalateQuestionRequest): Promise<WorkflowEscalateOutcome>;
}
