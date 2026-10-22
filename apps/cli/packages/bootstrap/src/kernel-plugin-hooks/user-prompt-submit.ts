// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// UserPromptSubmit 挂载点：接到 DSH 的 `agent/pre-step` waterfall。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.3）：
//   `agent/pre-step` 是 waterfall；**可拒绝该步骤，或替换进入步骤的消息**；
//   `next()` 保持当前 messages 不变。
//
// `PreStepDecision`（同文件 §九实测）：
//   | { kind: 'reject' }
//   | { kind: 'enter'; messages: UserMessage[]; startsRequestSeries?: true }
//
// 关键语义（合同 H3.5）：
//   · 「阻断用户提交」→ `{ kind: 'reject' }`
//   · 「注入 additionalContext」→ `{ kind: 'enter', messages: [...原 messages, 新消息] }`
//     —— **必须带上原 messages**，因为 `enter` 是「替换」而不是「追加」
//   · `startsRequestSeries` 旧 Hook 无对应概念 → 保持 undefined
import type { Context } from "@deepseek-ai/cordis";
import { randomUUID } from "node:crypto";
import { NO_OPINION, type HookVerdict } from "./verdict.js";

/** DSH 的 `UserMessage`（只取本模块构造所需的字段）。 */
export interface UserMessageLike {
  readonly id: string;
  readonly role: "user";
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly source: { readonly kind: "user" };
}

/** DSH 的 `PreStepDecision`。 */
export type PreStepDecisionLike =
  | { readonly kind: "reject" }
  | {
      readonly kind: "enter";
      readonly messages: readonly UserMessageLike[];
      readonly startsRequestSeries?: true;
    };

/** DSH 交给 `agent/pre-step` 的最小载荷。 */
export interface PreStepPayload {
  readonly messages: readonly UserMessageLike[];
  readonly turn: number;
  readonly step: number;
  readonly signal: AbortSignal;
}

/** 一次提交判定请求。 */
export interface UserPromptJudge {
  judge(input: {
    readonly messages: readonly UserMessageLike[];
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
 *   `source` 取 `{ kind: 'user' }` —— 这是「用户消息可携带任意 producer 的 kind」
 *   里最合适的一个：注入内容由用户配置的 Hook 产生。
 */
export function makeInjectedMessage(text: string): UserMessageLike {
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  };
}

/**
 * 把裁决转成 DSH 的 `PreStepDecision`。
 *
 * 映射（合同 H3.5）：
 *   - 无意见 → `next()` 委托（保持当前 messages）
 *   - `deny` → `{ kind: 'reject' }`（阻断用户提交）
 *   - 带 `context` 的裁决 → `{ kind: 'enter', messages: [...原, 注入] }`
 *   - `allow` / `ask` → 委托（这两个在提交阶段没有对应语义：
 *     提交没有「允许/审批」的概念，只有「接受/拒绝/改写」）
 */
export async function decidePreStep(
  judge: UserPromptJudge,
  payload: PreStepPayload,
  next: () => Promise<PreStepDecisionLike>,
): Promise<PreStepDecisionLike> {
  const verdict = await judge.judge({
    messages: payload.messages,
    turn: payload.turn,
    step: payload.step,
    signal: payload.signal,
  });

  if (verdict.kind === "deny") {
    return { kind: "reject" };
  }

  // 有注入内容时替换 messages（保留原有的，追加新的）。
  // 注意：`enter` 是「替换」语义，所以必须把原 messages 一起带上。
  if (verdict.context !== undefined && verdict.context.length > 0) {
    return {
      kind: "enter",
      messages: [...payload.messages, makeInjectedMessage(verdict.context)],
    };
  }

  // allow / ask / 无意见 → 委托。提交阶段没有「允许」或「审批」的语义。
  return await next();
}

/**
 * 注册 UserPromptSubmit 挂载点。
 */
export function mountUserPromptSubmit(ctx: Context, judge: UserPromptJudge): () => void {
  const handler = (payload: PreStepPayload, next: () => Promise<PreStepDecisionLike>) =>
    decidePreStep(judge, payload, next);
  return ctx.on("agent/pre-step", handler);
}

export { NO_OPINION };
