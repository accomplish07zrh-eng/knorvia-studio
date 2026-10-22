// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// UserPromptSubmit 挂载点：接到 DSH 的 `agent/pre-step` waterfall。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.3）：
//   `agent/pre-step` 是 waterfall；**可拒绝该步骤，或替换进入步骤的消息**；
//   `next()` 保持当前 messages 不变。
//
// `PreStepDecision`：
//   | { kind: 'reject' }
//   | { kind: 'enter'; messages: UserMessage[]; startsRequestSeries?: true }
//
// 关键语义（合同 H3.5）：
//   · 「阻断用户提交」→ `{ kind: 'reject' }`
//   · 「注入 additionalContext」→ `{ kind: 'enter', messages: [...原 messages, 新消息] }`
//     —— **必须带上原 messages**，因为 `enter` 是「替换」而不是「追加」（探针 16 实测）
//   · `startsRequestSeries` 旧 Hook 无对应概念 → 保持 undefined
//
// ⚠️ 类型必须用 DSH 的真实导出：
//   首版我写了 `UserMessageLike` / `PreStepDecisionLike` 自定义接口，
//   CI 报 TS2345（与 `ctx.on("agent/pre-step")` 期望的签名不兼容）。
//   **教训**：直接用 DSH 的 `UserMessage` / `PreStepDecision`。
import type { Context } from "@deepseek-ai/cordis";
import type { PreStepDecision } from "@deepseek-ai/dsh-agent";
import type { UserMessage } from "@deepseek-ai/dsh-llm";
import { randomUUID } from "node:crypto";
import { NO_OPINION, type HookVerdict } from "./verdict.js";

/** 一次提交判定请求：可返回裁决 + 可选注入内容。 */
export interface UserPromptJudge {
  judge(input: {
    readonly messages: readonly UserMessage[];
    readonly turn: number;
    readonly step: number;
    readonly signal: AbortSignal;
  }): Promise<HookVerdict & { readonly context?: string }>;
}

/**
 * 构造一条注入用的 `UserMessage`。
 *
 * 字段依据（`dsh-llm/lib/types/message.d.ts` L124-133 + L144-146）：
 *   `id` / `content` / `source` / `role` 都是必填。
 *   `source` 取 `{ kind: 'user' }` —— 用户消息可携带任意 producer 的 kind，
 *   而注入内容由用户配置的 Hook 产生，归「user」最合适。
 */
export function makeInjectedMessage(text: string): UserMessage {
  return {
    id: randomUUID() as UserMessage["id"],
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  } as UserMessage;
}

/**
 * 把裁决转成 DSH 的 `PreStepDecision`。
 *
 * 映射（合同 H3.5）：
 *   - 无意见 → `next()` 委托（保持当前 messages）
 *   - `deny` → `{ kind: 'reject' }`（阻断用户提交）
 *   - 带 `context` 的裁决 → `{ kind: 'enter', messages: [...原, 注入] }`
 *   - `allow` / `ask` → 委托（提交阶段没有「允许/审批」的概念，
 *     只有「接受/拒绝/改写」）
 */
export async function decidePreStep(
  judge: UserPromptJudge,
  messages: readonly UserMessage[],
  turn: number,
  step: number,
  signal: AbortSignal,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  const verdict = await judge.judge({ messages, turn, step, signal });

  if (verdict.kind === "deny") {
    return { kind: "reject" };
  }

  // 有注入内容时替换 messages（保留原有的，追加新的）。
  // 注意：`enter` 是「替换」语义，所以必须把原 messages 一起带上。
  if (verdict.context !== undefined && verdict.context.length > 0) {
    return {
      kind: "enter",
      messages: [...messages, makeInjectedMessage(verdict.context)],
    };
  }

  // allow / ask / 无意见 → 委托。提交阶段没有「允许」或「审批」的语义。
  return await next();
}

/**
 * 注册 UserPromptSubmit 挂载点。
 *
 * 监听器签名必须与 DSH 的 `agent/pre-step` 一致。
 */
export function mountUserPromptSubmit(ctx: Context, judge: UserPromptJudge): () => void {
  const handler = (
    payload: {
      agent: unknown;
      messages: UserMessage[];
      turn: number;
      step: number;
      signal: AbortSignal;
    },
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> =>
    decidePreStep(judge, payload.messages, payload.turn, payload.step, payload.signal, next);
  return ctx.on("agent/pre-step", handler);
}

export { NO_OPINION };
