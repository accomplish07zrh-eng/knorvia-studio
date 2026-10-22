// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// PostToolUse / PostToolUseFailure 挂载点：接到 DSH 的 `tools/post-execute` waterfall。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.6）：
//   `tools/post-execute` 是 waterfall，可 accept / replace / enrich / block；
//   **thrown tools still reach this waterfall as errors** → 同一个挂载点覆盖两个 Hook 事件。
//
// 关键约束（探针 11 实测）：
//   `result` 是 **deep-frozen**，不能原地修改；要改变结果必须**返回新的决策**。
//   这也意味着「替换内容」是返回 `{ kind: 'accept', content }`，而不是改 result。
import type { Context } from "@deepseek-ai/cordis";
import type { PostToolDecision } from "@deepseek-ai/dsh-tools";
import { NO_OPINION, type HookVerdict } from "./verdict.js";

/** DSH 的 `ToolExecutionResult`（只取本模块用到的字段）。 */
export interface PostToolResult {
  readonly isError: boolean;
  readonly content: readonly unknown[];
  readonly value?: unknown;
  readonly error?: { readonly message: string };
}

/** DSH 交给 `tools/post-execute` 的最小载荷。 */
export interface PostToolPayload {
  readonly name: string;
  readonly callId?: string;
  readonly signal?: AbortSignal;
}

/** 一次工具结果判定请求。 */
export interface PostToolJudge {
  judge(input: {
    readonly toolName: string;
    readonly toolUseId: string | undefined;
    /** 结果是否失败：决定旧 Hook 走 PostToolUse 还是 PostToolUseFailure。 */
    readonly isError: boolean;
    readonly resultContent: readonly unknown[];
    /** 失败时的错误消息（旧 Hook 的 `error` 字段）。 */
    readonly errorMessage: string | undefined;
    readonly signal: AbortSignal | undefined;
  }): Promise<HookVerdict>;
}

/**
 * 把裁决转成 DSH 的 `PostToolDecision`。
 *
 * 映射（合同 H3.3 / H3.4）：
 *   - 无意见 → `next()` 委托（最常见）
 *   - `allow` → `{ kind: 'accept' }` 显式接受
 *   - `deny`  → `{ kind: 'block', feedback }` —— 工具已经执行了，无法「取消」，
 *               只能把结果转成错误并给出反馈（DSH 的 block 语义）
 *   - `ask`   → 工具已执行，审批已无意义 → 委托（记 telemetry）
 */
export async function decidePostTool(
  judge: PostToolJudge,
  exec: PostToolPayload,
  result: PostToolResult,
  next: () => Promise<PostToolDecision>,
): Promise<PostToolDecision> {
  const verdict = await judge.judge({
    toolName: exec.name,
    toolUseId: exec.callId,
    isError: result.isError,
    resultContent: result.content,
    errorMessage: result.isError ? result.error?.message : undefined,
    signal: exec.signal,
  });

  switch (verdict.kind) {
    case "allow":
      return { kind: "accept" };
    case "deny":
      // 工具已经跑完，deny 只能表达为「把结果转成错误 + 反馈」。
      // 这是 DSH 的 block 语义，也是旧 Hook「PostToolUse 阻断」的唯一对应。
      return {
        kind: "block",
        feedback: [{ type: "text", text: verdict.reason }],
      };
    case "ask":
      // 工具已执行：此刻要求审批没有可审批的对象 → 委托并记 telemetry。
      return await next();
    case "no-opinion":
    default:
      return await next();
  }
}

/**
 * 注册 PostToolUse / PostToolUseFailure 挂载点。
 *
 * 两个 Hook 事件共用同一个 DSH 挂载点，由 `result.isError` 区分（探针 13）。
 */
export function mountPostToolUse(ctx: Context, judge: PostToolJudge): () => void {
  const handler = (
    exec: PostToolPayload,
    result: PostToolResult,
    next: () => Promise<PostToolDecision>,
  ) => decidePostTool(judge, exec, result, next);
  return ctx.on("tools/post-execute", handler);
}

export { NO_OPINION };
