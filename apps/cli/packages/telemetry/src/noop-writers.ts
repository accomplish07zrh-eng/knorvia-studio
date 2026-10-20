// SPDX-License-Identifier: Apache-2.0
// 全部 Span 种类的 noop writer。
//
// 三种情况下用到它们：进程未启用遥测、容量耗尽、Span 创建失败。要求只有一个——形状与真实
// writer 完全一致，调用方不必判空，观测缺席也不改变执行路径。
//
// 实现方式：按「方法名 → 子 Span 工厂」两张表生成对象，而不是逐个方法写空实现。
// 这样新增一个契约方法只需登记一个名字，也不会因为重复的空函数体退化成模板代码。
import type {
  AgentStepSpanWriter,
  AgentTurnSpanWriter,
  CommandExecutionSpanWriter,
  ContextCompactionSpanWriter,
  DetachedOperationSpanWriter,
  ModelAttemptSpanWriter,
  ModelCallSpanWriter,
  ToolExecutionSpanWriter,
} from "@knorvia/contracts/telemetry";
import type { AgentMetricSpanName } from "./agent-metrics.js";

/** 所有 noop 方法的统一实现：吞掉实参并返回 undefined。 */
function idle(): void {
  // 观测缺席时什么都不做。
}

/** 作用域方法：没有因果引用、回调直接执行。 */
const SCOPE_METHODS = {
  captureCausation: () => undefined,
  run: <T>(execute: () => T): T => execute(),
};

/**
 * 生成一个 noop writer：`methods` 里的每个名字都映射到空实现，
 * `children` 里的每个名字映射到「返回另一个 noop writer」的工厂。
 */
function noopWriter(
  methods: readonly string[],
  children: Readonly<Record<string, () => unknown>> = {},
): Record<string, unknown> {
  const writer: Record<string, unknown> = { ...SCOPE_METHODS };
  for (const name of methods) writer[name] = idle;
  for (const [name, child] of Object.entries(children)) writer[name] = child;
  return writer;
}

/** 每种 Span 的契约方法名（不含作用域的 captureCausation / run）。 */
const METHOD_NAMES = {
  command: [
    "finishBackgrounded",
    "finishCancelled",
    "finishCompleted",
    "finishFailed",
    "markFirstOutput",
    "markTerminationRequested",
    "setExitCode",
    "setOutputBytes",
    "setSignal",
    "setTimedOut",
  ],
  compaction: [
    "finishCancelled",
    "finishCompleted",
    "finishDiscarded",
    "finishFailed",
    "markFallbackSelected",
    "setInputTokens",
    "setOutputTokens",
  ],
  detached: ["finishCancelled", "finishCompleted", "finishFailed", "setResultType"],
  modelAttempt: [
    "finishAbandoned",
    "finishCancelled",
    "finishCompleted",
    "finishFailed",
    "markFirstContent",
    "markFirstProviderEvent",
    "markFirstText",
    "markStreamStalled",
    "setCacheReadTokens",
    "setCacheWriteTokens",
    "setEffectiveReasoningBudgetTokens",
    "setEffectiveReasoningControl",
    "setEffectiveReasoningLevel",
    "setEffectiveReasoningState",
    "setFinishReason",
    "setHttpStatusCode",
    "setInputTokens",
    "setOutputTokens",
    "setProviderErrorCode",
    "setProviderErrorMessage",
    "setProviderRequestId",
    "setReasoningTokens",
    "setResponseModel",
    "setRetryAfterMs",
    "setStreamOutputCommitted",
  ],
  modelCall: [
    "finishAbandoned",
    "finishCancelled",
    "finishCompleted",
    "finishFailed",
    "markFallbackSelected",
  ],
  step: ["finishCancelled", "finishCompleted", "finishDiscarded", "finishFailed"],
  tool: [
    "finishCancelled",
    "finishCompleted",
    "finishDenied",
    "finishFailed",
    "markPermissionRequested",
    "setOutputBytes",
    "setOutputTruncated",
    "setPermissionDecision",
  ],
  turn: ["finishCancelled", "finishCompleted", "finishFailed"],
} as const;

/** command 是最小单元：它不派生任何子 Span。 */
const COMMAND_NOOP = noopWriter(METHOD_NAMES.command) as unknown as CommandExecutionSpanWriter;

const TOOL_NOOP = noopWriter(METHOD_NAMES.tool, {
  startCommand: () => COMMAND_NOOP,
}) as unknown as ToolExecutionSpanWriter;

const MODEL_ATTEMPT_NOOP = noopWriter(
  METHOD_NAMES.modelAttempt,
) as unknown as ModelAttemptSpanWriter;

const MODEL_CALL_NOOP = noopWriter(METHOD_NAMES.modelCall, {
  startAttempt: () => MODEL_ATTEMPT_NOOP,
}) as unknown as ModelCallSpanWriter;

const STEP_NOOP = noopWriter(METHOD_NAMES.step) as unknown as AgentStepSpanWriter;
const TURN_NOOP = noopWriter(METHOD_NAMES.turn) as unknown as AgentTurnSpanWriter;
const COMPACTION_NOOP = noopWriter(
  METHOD_NAMES.compaction,
) as unknown as ContextCompactionSpanWriter;
const DETACHED_NOOP = noopWriter(METHOD_NAMES.detached) as unknown as DetachedOperationSpanWriter;

/** Span 名 → noop writer。运行时的回退路径只查这张表。 */
export const NOOP_WRITERS: Readonly<Record<AgentMetricSpanName, unknown>> = {
  agent_step: STEP_NOOP,
  agent_turn: TURN_NOOP,
  command_execution: COMMAND_NOOP,
  context_compaction: COMPACTION_NOOP,
  detached_operation: DETACHED_NOOP,
  model_attempt: MODEL_ATTEMPT_NOOP,
  model_call: MODEL_CALL_NOOP,
  tool_execution: TOOL_NOOP,
};

/**
 * 未启用遥测时的进程级实现。
 * 每个 start 方法都返回同一个 noop writer：它们没有状态，共享实例没有副作用。
 */
export class NoopAgentExecutionTelemetry {
  abandonSession(): void {}
  captureCausation() {
    return undefined;
  }
  startCall(): ModelCallSpanWriter {
    return MODEL_CALL_NOOP;
  }
  startCompaction(): ContextCompactionSpanWriter {
    return COMPACTION_NOOP;
  }
  startDetachedOperation(): DetachedOperationSpanWriter {
    return DETACHED_NOOP;
  }
  startStep(): AgentStepSpanWriter {
    return STEP_NOOP;
  }
  startTool(): ToolExecutionSpanWriter {
    return TOOL_NOOP;
  }
  startTurn(): AgentTurnSpanWriter {
    return TURN_NOOP;
  }
}
