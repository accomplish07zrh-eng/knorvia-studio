// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// PermissionRequest 挂载点：把 Hook 的审批裁决接到 DSH 的 `approval/request` waterfall。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.5）：
//   `approval/request` 是 waterfall；**返回一个 outcome 即认领该请求，或调 `next()` 委托**。
//   `ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`
//
// 语义要点：
//   · DSH 只有「一次性允许」，没有旧 Hook 的「永久允许」→ 旧 allow 映射到 allowed-once
//   · 无意见必须调 next()，否则会认领掉下游应答者的机会
import type { Context } from "@deepseek-ai/cordis";
import type { ApprovalOutcome } from "@deepseek-ai/dsh-user-approval";
import { NO_OPINION, type HookVerdict } from "./verdict.js";

/** DSH 交给 `approval/request` 的最小载荷（只取本模块用到的字段）。 */
export interface ApprovalPayload {
  readonly toolName: string;
  readonly callId?: string;
  readonly reason?: string;
  readonly signal?: AbortSignal;
}

/** 一次审批判定请求。 */
export interface ApprovalJudge {
  judge(input: {
    readonly toolName: string;
    readonly toolUseId: string | undefined;
    readonly reason: string | undefined;
    readonly signal: AbortSignal | undefined;
  }): Promise<HookVerdict>;
}

/**
 * 把裁决转成 DSH 的 `ApprovalOutcome`。
 *
 * 映射依据（合同 §2.5 / H3.2）：
 *   - `allow` → `'allowed-once'`（DSH 无「永久允许」语义）
 *   - `deny`  → `'rejected'`
 *   - `ask`   → 本包不作为应答者认领；委托给下游（`next()`），
 *               因为「要求审批」正是这个事件本身在做的事，再返回 ask 会造成循环
 *   - 无意见  → `next()` 委托
 */
export async function decideApproval(
  judge: ApprovalJudge,
  req: ApprovalPayload,
  next: () => Promise<ApprovalOutcome>,
): Promise<ApprovalOutcome> {
  const verdict = await judge.judge({
    toolName: req.toolName,
    toolUseId: req.callId,
    reason: req.reason,
    signal: req.signal,
  });

  switch (verdict.kind) {
    case "allow":
      return "allowed-once";
    case "deny":
      return "rejected";
    case "ask":
      // 本事件本身就是「请求审批」；返回 ask 无对应 outcome，
      // 且认领后不给用户任何决策机会 → 必须委托。
      return await next();
    case "no-opinion":
    default:
      return await next();
  }
}

/**
 * 注册 PermissionRequest 挂载点。
 *
 * 返回 disposer，供 cordis 生命周期在插件卸载时注销（behavior.md H1.3）。
 */
export function mountPermissionRequest(ctx: Context, judge: ApprovalJudge): () => void {
  const handler = (req: ApprovalPayload, next: () => Promise<ApprovalOutcome>) =>
    decideApproval(judge, req, next);
  return ctx.on("approval/request", handler);
}

export { NO_OPINION };
