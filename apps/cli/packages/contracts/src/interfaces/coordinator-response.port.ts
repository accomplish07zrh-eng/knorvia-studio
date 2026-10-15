// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// 协调者答复端口 —— 子代理把结论递回父侧的那一次调用
// ════════════════════════════════════════════════════════════
// 被派出去的子代理得出结论后，要把结论交还给派它的那一侧。这条路不由模型挑：child session、agent 与
// 父级路由都得在装配端口时就绑定好，模型只能决定「说什么」。时序也卡得很紧——respond 的返回必须是
// 同步的：答复先进父队列、子代理那次工具调用随后才能收尾，这个先后关系不能交给 Promise 去碰运气。

// 章节：一 答复读数 · 二 答复入参 · 三 端口本体

import type { TraceContext } from "../tracing/tracer.js";
import type { ToolCallId } from "./shared.js";

// ── 一、答复读数：这次递送的结果 ─────────────────────────────────────

/** 一次答复的回执：成败状态、为这次答复生成的 id、父侧落下的消息文本，失败原因放在 error 里。 */
export interface CoordinatorResponseResult {
  status: "success" | "failed";
  responseId: string;
  message: string;
  error?: string;
}

// ── 二、答复入参：子代理交出来的内容 ─────────────────────────────────

/** 子代理要递的东西：一句给人看的摘要、完整消息正文，以及它自己那次工具调用的 id（对账用）。 */
export interface CoordinatorResponseRequest {
  childToolCallId: ToolCallId | string;
  summary: string;
  message: string;
  trace: TraceContext;
}

// ── 三、端口本体：唯一的同步入口 ─────────────────────────────────────

/** 子代理递送结论的端口，由父侧在派活时装配好再交给子代理，所以路由身份不在入参里、模型也覆盖不了； 返回的是同步回执而不是 Promise，理由见文件开头。 */
export interface CoordinatorResponsePort {
  respond(request: CoordinatorResponseRequest): CoordinatorResponseResult;
}
