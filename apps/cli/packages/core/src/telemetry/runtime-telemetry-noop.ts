// SPDX-License-Identifier: Apache-2.0
// 空实现（NOOP）遥测端口：用「方法名表」批量生成无副作用方法，避免逐条手写空方法。
import type {
  AgentExecutionTelemetryPort,
  AgentStepSpanWriter,
  AgentTurnSpanWriter,
  CommandExecutionSpanWriter,
  ContextCompactionSpanWriter,
  DetachedOperationSpanWriter,
  ModelAttemptSpanWriter,
  ModelCallSpanWriter,
  ToolExecutionSpanWriter,
} from "@knorvia/contracts";

/** 作用域基础实现：不记录因果，run 直接执行。 */
const SCOPE_BASE = {
  captureCausation: () => undefined,
  run: <TValue>(execute: () => TValue): TValue => execute(),
};

/** 把方法名表展开成空方法表（无副作用、无返回）。 */
const voidMethods = (names: readonly string[]): Record<string, () => void> =>
  Object.fromEntries(names.map((name) => [name, () => {}]));

const NOOP_COMMAND = {
  ...SCOPE_BASE,
  ...voidMethods([
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
  ]),
} as unknown as CommandExecutionSpanWriter;

const NOOP_TOOL = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishCancelled",
    "finishCompleted",
    "finishDenied",
    "finishFailed",
    "markPermissionRequested",
    "setOutputBytes",
    "setOutputTruncated",
    "setPermissionDecision",
  ]),
  startCommand: () => NOOP_COMMAND,
} as unknown as ToolExecutionSpanWriter;

const NOOP_STEP = {
  ...SCOPE_BASE,
  ...voidMethods(["finishCancelled", "finishCompleted", "finishDiscarded", "finishFailed"]),
} as unknown as AgentStepSpanWriter;

const NOOP_TURN = {
  ...SCOPE_BASE,
  ...voidMethods(["finishCancelled", "finishCompleted", "finishFailed"]),
} as unknown as AgentTurnSpanWriter;

const NOOP_COMPACTION = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishCancelled",
    "finishCompleted",
    "finishDiscarded",
    "finishFailed",
    "markFallbackSelected",
    "setInputTokens",
    "setOutputTokens",
  ]),
} as unknown as ContextCompactionSpanWriter;

const NOOP_DETACHED = {
  ...SCOPE_BASE,
  ...voidMethods(["finishCancelled", "finishCompleted", "finishFailed", "setResultType"]),
} as unknown as DetachedOperationSpanWriter;

const NOOP_ATTEMPT = {
  ...SCOPE_BASE,
  ...voidMethods([
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
  ]),
} as unknown as ModelAttemptSpanWriter;

const NOOP_CALL = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishAbandoned",
    "finishCancelled",
    "finishCompleted",
    "finishFailed",
    "markFallbackSelected",
  ]),
  startAttempt: () => NOOP_ATTEMPT,
} as unknown as ModelCallSpanWriter;

/** 默认遥测端口：所有写入都是空操作，读取因果返回 undefined。 */
export const NOOP_AGENT_EXECUTION_TELEMETRY: AgentExecutionTelemetryPort = {
  abandonSession: () => {},
  captureCausation: () => undefined,
  startCompaction: () => NOOP_COMPACTION,
  startDetachedOperation: () => NOOP_DETACHED,
  startStep: () => NOOP_STEP,
  startTool: () => NOOP_TOOL,
  startTurn: () => NOOP_TURN,
};
