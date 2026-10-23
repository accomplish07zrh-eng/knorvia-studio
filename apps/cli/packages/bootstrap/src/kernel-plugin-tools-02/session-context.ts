// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// `ReadSessionContext` 的执行体：把 DSH 会话投影 + Knorvia 附加上下文组装成快照。
//
// 依据：`specs/contracts/kernel-plugin-tools-02/behavior.md` B4（输出形状）/ B8（缺失失败）。
//
// ⚠️ 本包不直接读 DSH 会话存储 —— 投影由宿主注入的 `SessionContextSource` 提供。
//   这样插件对 DSH 零耦合，测试可注入替身。

/** 会话上下文源（宿主注入）。 */
export interface SessionContextSource {
  /** 读会话投影（todos / plan 等）。 */
  readProjection(sessionId: string): Promise<{
    readonly todos: readonly { readonly content: string; readonly status: string }[] | null;
    readonly planModeActive: boolean;
  }>;
  /** 读 Knorvia 附加上下文（工作区事实、模式等）。 */
  readAdditionalContext(sessionId: string): Promise<Record<string, unknown>>;
}

/** 本工具的输出（B4：键集合与旧实现对齐）。 */
export interface ReadSessionContextResult {
  readonly sessionId: string;
  readonly todos: readonly { readonly content: string; readonly status: string }[] | null;
  readonly planModeActive: boolean;
  /** Knorvia 附加上下文（键由源决定，本包原样透传）。 */
  readonly additionalContext: Record<string, unknown>;
}

/** 执行上下文（B8）。 */
export interface ReadSessionContextCallContext {
  readonly getSessionContextSource: () => SessionContextSource | undefined;
  readonly sessionId: string;
}

/** 源不可用时的固定文案（B8）。 */
const SOURCE_UNAVAILABLE = "Session context is not available in this session";

/**
 * 读会话上下文（B4）。
 *
 * 输出形状：
 * ```
 * { sessionId, todos, planModeActive, additionalContext }
 * ```
 *
 * ⚠️ `todos` 在首次写入前是 `null`（不是空数组）——
 * 这是 DSH 会话投影的实际形状（B13），原样透传而不归一。
 */
export async function executeReadSessionContext(
  context: ReadSessionContextCallContext,
): Promise<ReadSessionContextResult> {
  const source = context.getSessionContextSource();
  if (source === undefined) throw new Error(SOURCE_UNAVAILABLE);

  const [projection, additionalContext] = await Promise.all([
    source.readProjection(context.sessionId),
    source.readAdditionalContext(context.sessionId),
  ]);

  return {
    sessionId: context.sessionId,
    // 原样透传：`null` 表示「首次写入前」，与空数组不同（B13）。
    todos: projection.todos,
    planModeActive: projection.planModeActive,
    additionalContext,
  };
}
