// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// PreToolUse 挂载点：把 Hook 的权限裁决接到 DSH 的 `tools/pre-execute` waterfall。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.4）：
//   `tools/pre-execute` 是 waterfall，可 allow / deny / cancel / ask；
//   `next()` 委托为 allow；不调 `next()` 即短路后续监听器。
//
// 本包的分工（同文件 §六）：policy 先判产品级硬约束，本包只判用户配置的 Hook 脚本。
// 因此这里**不读取、不修改模式状态** —— 模式事实由 policy 拥有。
import type { Context } from "@deepseek-ai/cordis";
import type { PreToolDecision } from "@deepseek-ai/dsh-tools";
import { NO_OPINION, verdictFromPermissionDecision, type HookVerdict } from "./verdict.js";

/** DSH 交给 `tools/pre-execute` 的最小载荷（只取本模块用到的字段）。 */
export interface PreToolPayload {
  readonly callId: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly signal: AbortSignal;
}

/** 一次 Hook 判定请求：由上层执行器填充，挂载点只负责转成 DSH 决策。 */
export interface PreToolJudge {
  /** 返回裁决；实现方负责执行配置的 Hook 并解析输出。 */
  judge(input: {
    readonly toolName: string;
    readonly toolInput: unknown;
    readonly toolUseId: string;
    readonly signal: AbortSignal;
  }): Promise<HookVerdict>;
}

/**
 * 把裁决转成 DSH 的 `PreToolDecision`。
 *
 * 三种情况的映射：
 *   - 无意见 → 委托（`next()`），让下游监听器（若有）与 DSH 默认行为继续
 *   - allow  → 显式放行，不调 `next()`
 *   - deny   → 阻断，带 reason（DSH 类型要求 deny 必须有 reason）
 *   - ask    → 要求审批；DSH 在无审批支持时把它降级为 deny（§2.4）
 */
export async function decidePreTool(
  judge: PreToolJudge,
  exec: PreToolPayload,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  const verdict = await judge.judge({
    toolName: exec.name,
    toolInput: exec.arguments,
    toolUseId: exec.callId,
    signal: exec.signal,
  });

  switch (verdict.kind) {
    case "deny":
      return { kind: "deny", reason: verdict.reason };
    case "ask":
      return { kind: "ask", reason: verdict.reason };
    case "allow":
      return { kind: "allow" };
    case "no-opinion":
    default:
      // 无意见 = 委托。这是最常见的路径：大多数工具调用没有匹配的 Hook。
      return await next();
  }
}

/**
 * 注册 PreToolUse 挂载点。
 *
 * 返回 disposer，供 cordis 生命周期在插件卸载时注销（behavior.md H1.3）。
 */
export function mountPreToolUse(ctx: Context, judge: PreToolJudge): () => void {
  const handler = (exec: PreToolPayload, next: () => Promise<PreToolDecision>) =>
    decidePreTool(judge, exec, next);
  // cordis 的 `on` 返回 disposer；不调 `next()` 即 veto（§2.1）。
  return ctx.on("tools/pre-execute", handler);
}

export { NO_OPINION, verdictFromPermissionDecision };
