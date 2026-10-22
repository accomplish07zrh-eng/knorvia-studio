// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Stop 挂载点：接到 DSH 的 `agent/turn-stopping`。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.8）：
//   `agent/turn-stopping` 是 `serial`；**监听器提出异议时调 `agent.steer(...)`，
//   机器重读 inbox：有新 steering 就再跑一步，没有就关闭回合**。
//   `serial` 的语义：按序 await 直到某个监听器 bail（首个 bail 值即短路）。
//
// 关键映射（合同 H3.6）：
//   旧 Hook 的 `continue: true` → `agent.steer(一条 UserMessage)`
//   旧 Hook 的 `continue: false` / 无决策 → 不动作（回合正常关闭）
//
// ⚠️ 已知差异（known-differences D2）：
//   旧实现按注册顺序短路（第一个要 continue 的之后的 Hook 不再执行）；
//   新实现是 serial，**所有监听器都会执行**（除非某个 bail），但聚合结论等价。
import type { Context } from "@deepseek-ai/cordis";
import { NO_OPINION, type HookVerdict } from "./verdict.js";
import { makeInjectedMessage, type UserMessageLike } from "./user-prompt-submit.js";

/** DSH 的 agent（只取本模块用到的部分）。 */
export interface AgentLike {
  steer(message: UserMessageLike): void;
}

/** DSH 交给 `agent/turn-stopping` 的载荷。 */
export interface TurnStoppingPayload {
  readonly agent: AgentLike;
  readonly turn: number;
  readonly signal: AbortSignal;
}

/** 一次回合停止判定请求。 */
export interface StopJudge {
  judge(input: { readonly turn: number; readonly signal: AbortSignal }): Promise<HookVerdict>;
}

/**
 * 处理一次回合停止。
 *
 * 映射：
 *   - `deny` → 视为「要求继续」：调 `agent.steer(...)` 让机器再跑一步。
 *     旧 Hook 的 `continue: true` 与「deny 回合结束」是同一件事的两种说法 ——
 *     在 Stop 事件里，「拒绝停止」就是「继续」。
 *   - 其余（allow / ask / 无意见）→ 不动作，回合正常关闭。
 *
 * 为什么不返回 bail 值：`serial` 的 bail 会短路后续监听器，
 * 而 Stop 的多个 Hook 都应该有机会表态（known-differences D2）。
 */
export async function decideTurnStopping(
  judge: StopJudge,
  payload: TurnStoppingPayload,
): Promise<void> {
  const verdict = await judge.judge({ turn: payload.turn, signal: payload.signal });

  if (verdict.kind === "deny") {
    // 「拒绝停止」= 「继续」：构造一条消息并 steer，机器会重读 inbox。
    payload.agent.steer(makeInjectedMessage(verdict.reason));
  }
  // allow / ask / 无意见 → 不动作
}

/**
 * 注册 Stop 挂载点。
 */
export function mountTurnStopping(ctx: Context, judge: StopJudge): () => void {
  const handler = (payload: TurnStoppingPayload) => decideTurnStopping(judge, payload);
  return ctx.on("agent/turn-stopping", handler);
}

export { NO_OPINION };
