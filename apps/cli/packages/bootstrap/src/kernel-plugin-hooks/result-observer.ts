// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 纯观测挂载点：接到 DSH 的 `tools/result`（emit 模式）。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.7）：
//   `tools/result` 是 `@mode emit`；返回值被忽略；result 是 deep-frozen。
//   用途：**审计与 telemetry**，不承担决策。
//
// ⚠️ 第 5 个语义陷阱（探针 23b 实测）：
//   DSH 的 JSDoc 说「Listener failures are contained」，但**containment 是 DSH 做的**，
//   不是 cordis 的能力 —— cordis 的 `emit` 会直接把监听器的异常抛给调用方。
//   所以本模块的监听器**必须自己保证不抛**：观测逻辑的失败不能影响工具执行。
//
// ⚠️ 类型必须用 DSH 的真实导出（不用自定义接口）：
//   首版我写了只含部分字段的 `ObservedPayload` / `ObservedResult`，
//   结果 CI 的「Build CLI packages」报 TS2345（签名与 `ctx.on` 期望的不兼容）。
//   **教训**：DSH 导出的类型就直接用，不要为「只取部分字段」另写一份 —— 会丢失兼容性。
import type { Context } from "@deepseek-ai/cordis";
import type { ToolExecution, ToolExecutionResult } from "@deepseek-ai/dsh-tools";

/** 一次工具结果的观测回调。 */
export interface ResultObserver {
  observe(input: {
    readonly toolName: string;
    readonly toolUseId: string | undefined;
    readonly isError: boolean;
    readonly contentBlockCount: number;
    readonly errorMessage: string | undefined;
  }): void;
}

/**
 * 安全地调用观测回调。
 *
 * 为什么必须 try/catch（探针 23b）：cordis 的 `emit` 不捕获监听器异常，
 * 而观测逻辑（写日志、累计指标）失败**不应该影响工具执行** ——
 * 这是「观测不能改变主流程」的最低要求。
 *
 * 捕获后不重新抛出，也不打印到 stderr（会污染 CLI 输出）；
 * 由调用方通过 observer 自己的实现决定怎么记录。
 */
export function safeObserve(
  observer: ResultObserver,
  exec: Readonly<ToolExecution>,
  result: Readonly<ToolExecutionResult>,
): void {
  try {
    observer.observe({
      toolName: exec.name,
      toolUseId: exec.callId,
      isError: result.isError,
      contentBlockCount: result.content.length,
      errorMessage: result.isError ? result.error.message : undefined,
    });
  } catch {
    // 观测失败静默忽略：这是「观测不影响主流程」的实现。
    // 若需要诊断观测本身的失败，应由 observer 内部处理（它有上下文）。
  }
}

/**
 * 注册纯观测挂载点。
 *
 * 注意：本挂载点**不产生任何决策**（emit 模式的返回值被忽略）。
 * 它只用于审计与 telemetry，不参与 7 种 Hook 事件的决策路径。
 *
 * 返回 `undefined` 是 DSH 对 `tools/result` 监听器的类型要求（不是疏忽）。
 */
export function mountResultObserver(ctx: Context, observer: ResultObserver): () => void {
  const handler = (
    exec: Readonly<ToolExecution>,
    result: Readonly<ToolExecutionResult>,
  ): undefined => {
    safeObserve(observer, exec, result);
    return undefined;
  };
  return ctx.on("tools/result", handler);
}
