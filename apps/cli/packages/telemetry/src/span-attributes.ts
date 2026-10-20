// SPDX-License-Identifier: Apache-2.0
// Span 出生时要带的属性：按「一行一个取值规则」的表组织。
//
// 每行声明三件事：写到哪个键、从输入的哪个字段取、用哪种闸门归一。加字段是加一行，
// 不是再写一行属性赋值；表的顺序就是键在 Span 上出现的顺序。
import type { Attributes } from "@opentelemetry/api";
import type {
  AgentStepTraceStart,
  AgentTelemetryExecutionContext,
  AgentTurnTraceStart,
  CommandTraceStart,
  CompactionTraceStart,
  DetachedOperationTraceStart,
  ModelAttemptTraceStart,
  ModelCallTraceStart,
  ToolTraceStart,
} from "@knorvia/contracts/telemetry";
import {
  compactAttributes,
  executionProjection,
  finiteNonNegative,
  integer,
  safeEnum,
  safeId,
  safeString,
} from "./gates.js";
import { toolCompatibilityAttributes } from "./compatibility-adapters.js";

/** 一行属性规则：键、取值器；取值器返回 undefined 时整键不写。 */
type AttrRow<T> = readonly [key: string, read: (input: T) => unknown];

/** 按表求值：顺序固定，空值由 compactAttributes 统一剔除。 */
function fromTable<T>(rows: readonly AttrRow<T>[], input: T, extra: Attributes = {}): Attributes {
  const produced: Attributes = { ...extra };
  for (const [key, read] of rows) {
    produced[key] = read(input) as Attributes[string];
  }
  return compactAttributes(produced);
}

/** turn：执行投影（含角色/代理/身份/查询/会话）+ 轮次与来源。 */
export function turnAttributes(
  correlation: AgentTelemetryExecutionContext,
  input: AgentTurnTraceStart,
): Attributes {
  const projection = executionProjection(correlation, {
    actor: true,
    agent: true,
    identity: true,
    query: true,
    session: true,
  });
  return fromTable<AgentTurnTraceStart>(
    [
      ["knorvia.agent_turn.turn_number", (value) => integer(value.turnNumber)],
      ["knorvia.agent_turn.input_source", (value) => safeEnum(value.inputSource)],
    ],
    input,
    projection,
  );
}

/** step：继承父级执行投影 + 步标识与序号。 */
export function stepAttributes(
  correlation: AgentTelemetryExecutionContext | undefined,
  input: AgentStepTraceStart,
): Attributes {
  return fromTable<AgentStepTraceStart>(
    [
      ["knorvia.agent_step.step_id", (value) => safeId(value.stepId)],
      ["knorvia.agent_step.step_index", (value) => integer(value.stepIndex)],
    ],
    input,
    executionProjection(correlation),
  );
}

/** tool：执行投影（含角色）+ 工具标识与外部约定字段。 */
export function toolAttributes(
  correlation: AgentTelemetryExecutionContext | undefined,
  input: ToolTraceStart,
): Attributes {
  return fromTable<ToolTraceStart>(
    [
      ["knorvia.execution.tool_call_id", (value) => safeId(value.toolCallId)],
      ["knorvia.tool_execution.tool_name", (value) => safeString(value.registeredToolName, 128)],
    ],
    input,
    {
      ...executionProjection(correlation, { actor: true }),
      ...toolCompatibilityAttributes({
        toolCallId: input.toolCallId,
        toolName: input.registeredToolName,
      }),
    },
  );
}

/** command：父 tool 的调用标识 + 命令分类与执行形态。 */
export function commandAttributes(
  correlation: AgentTelemetryExecutionContext | undefined,
  toolCallId: string | undefined,
  input: CommandTraceStart,
): Attributes {
  const extra: Attributes = {
    ...executionProjection(correlation),
    "knorvia.execution.tool_call_id": safeId(toolCallId),
  } as Attributes;
  return fromTable<CommandTraceStart>(
    [
      ["knorvia.command_execution.safe_name", (value) => safeString(value.safeName, 128)],
      ["knorvia.command_execution.category", (value) => safeEnum(value.category)],
      ["knorvia.command_execution.command_count", (value) => integer(value.commandCount)],
      ["knorvia.command_execution.shell_kind", (value) => safeEnum(value.shellKind)],
      ["knorvia.command_execution.sandboxed", (value) => value.sandboxed],
    ],
    input,
    extra,
  );
}

/** compaction：触发条件、策略窗口、token 来源与恢复来源。 */
export function compactionAttributes(
  correlation: AgentTelemetryExecutionContext | undefined,
  input: CompactionTraceStart,
): Attributes {
  return fromTable<CompactionTraceStart>(
    [
      ["knorvia.context_compaction.trigger", (value) => safeEnum(value.trigger)],
      ["knorvia.context_compaction.phase", (value) => safeEnum(value.phase)],
      ["knorvia.context_compaction.model_mode", (value) => safeEnum(value.modelMode)],
      ["knorvia.context_compaction.outer_attempt", (value) => integer(value.outerAttempt)],
      ["knorvia.context_compaction.max_attempts", (value) => integer(value.maxAttempts)],
      [
        "knorvia.context_compaction.triggering_step_index",
        (value) => integer(value.triggeringStepIndex),
      ],
      [
        "knorvia.context_compaction.policy_context_window_tokens",
        (value) => finiteNonNegative(value.policyContextWindowTokens),
      ],
      [
        "knorvia.context_compaction.threshold_tokens",
        (value) => finiteNonNegative(value.thresholdTokens),
      ],
      ["knorvia.context_compaction.token_source", (value) => safeEnum(value.tokenSource)],
      [
        "knorvia.context_compaction.recovered_from_logical_call_id",
        (value) => safeId(value.recoveredFromLogicalCallId),
      ],
    ],
    input,
    executionProjection(correlation),
  );
}

/** detached：操作、执行形态、触发者、目标与分片进度。 */
export function detachedAttributes(input: DetachedOperationTraceStart): Attributes {
  const projection = executionProjection(input.context, {
    actor: true,
    query: true,
    session: true,
  });
  const rows: ReadonlyArray<AttrRow<DetachedOperationTraceStart>> = [
    ["knorvia.detached_operation.operation", (value) => safeEnum(value.operation)],
    ["knorvia.detached_operation.execution_kind", (value) => safeEnum(value.executionKind)],
    ["knorvia.detached_operation.trigger", (value) => safeEnum(value.trigger)],
    ["knorvia.detached_operation.target_kind", (value) => safeEnum(value.targetKind)],
    ["knorvia.detached_operation.goal_iteration", (value) => integer(value.goalIteration)],
    ["knorvia.detached_operation.chunk_index", (value) => integer(value.chunkIndex)],
    ["knorvia.detached_operation.chunk_count", (value) => integer(value.chunkCount)],
  ];
  return fromTable(rows, input, projection);
}

/** model_call：调用身份 + 请求目标 + reasoning 请求意图。 */
export function modelCallAttributes(
  correlation: AgentTelemetryExecutionContext | undefined,
  input: ModelCallTraceStart,
): Attributes {
  const reasoning = input.requested.reasoning;
  const projection = executionProjection(correlation, {
    actor: true,
    query: true,
    session: true,
  });
  return fromTable<ModelCallTraceStart>(
    [
      ["knorvia.execution.logical_call_id", (value) => safeId(value.logicalCallId)],
      ["knorvia.model_call.operation", (value) => safeEnum(value.operation)],
      ["knorvia.model_call.streaming", (value) => value.streaming],
      ["knorvia.model_call.model_role", (value) => safeEnum(value.modelRole)],
      [
        "knorvia.model_call.requested_provider_id",
        (value) => safeString(value.requested.providerId, 128),
      ],
      [
        "knorvia.model_call.requested_model",
        (value) => safeString(value.requested.requestedModel, 128),
      ],
      ["knorvia.model_call.reasoning_capability", () => safeEnum(reasoning.capability)],
      ["knorvia.model_call.reasoning_requested_state", () => safeEnum(reasoning.requestedState)],
      [
        "knorvia.model_call.reasoning_requested_control",
        () => safeEnum(reasoning.requestedControl),
      ],
      [
        "knorvia.model_call.reasoning_requested_level",
        () => safeString(reasoning.requestedLevel, 128),
      ],
      [
        "knorvia.model_call.reasoning_requested_budget_tokens",
        () => integer(reasoning.requestedBudgetTokens),
      ],
      ["knorvia.model_call.call_cause", (value) => safeEnum(value.callCause)],
      [
        "knorvia.model_call.previous_logical_call_id",
        (value) => safeId(value.previousLogicalCallId),
      ],
    ],
    input,
    projection,
  );
}

/** attempt 的上下文事实：父调用的标识与角色，由运行时给出。 */
export interface AttemptParent {
  correlation?: AgentTelemetryExecutionContext;
  logicalCallId: string | undefined;
  modelRole: string | undefined;
  operation: string | undefined;
  toolCallId: string | undefined;
}

/** model_attempt：尝试序号、端点、传输方式、API operation 与 reasoning 事实。 */
export function modelAttemptAttributes(
  input: ModelAttemptTraceStart,
  parent: AttemptParent,
): Attributes {
  const target = input.target;
  const reasoning = target.reasoning;
  const projection = executionProjection(parent.correlation, {
    actor: true,
    query: true,
    session: true,
  });
  return fromTable<ModelAttemptTraceStart>(
    [
      ["knorvia.execution.tool_call_id", () => safeId(parent.toolCallId)],
      ["knorvia.execution.logical_call_id", () => parent.logicalCallId],
      ["knorvia.execution.model_operation", () => parent.operation],
      ["knorvia.execution.model_role", () => parent.modelRole],
      ["knorvia.model_attempt.request_id", (value) => safeId(value.requestId)],
      ["knorvia.model_attempt.attempt_number", (value) => integer(value.attemptNumber)],
      ["knorvia.model_attempt.max_attempts", (value) => integer(value.maxAttempts)],
      ["knorvia.model_attempt.attempt_cause", (value) => safeEnum(value.attemptCause)],
      ["knorvia.model_attempt.previous_request_id", (value) => safeId(value.previousRequestId)],
      ["knorvia.model_attempt.retry_delay_ms", (value) => finiteNonNegative(value.retryDelayMs)],
      ["knorvia.model_attempt.provider_id", () => safeString(target.providerId, 128)],
      ["knorvia.model_attempt.provider_kind", () => safeEnum(target.providerKind)],
      ["knorvia.model_attempt.provider_origin", () => safeString(target.providerOrigin)],
      ["knorvia.model_attempt.provider_route", () => safeString(target.providerRoute)],
      ["knorvia.model_attempt.requested_model", () => safeString(target.requestedModel, 128)],
      ["knorvia.model_attempt.transport", (value) => safeEnum(value.transport)],
      ["knorvia.model_attempt.api_operation", (value) => safeEnum(value.apiOperation)],
      ["knorvia.model_attempt.reasoning_capability", () => safeEnum(reasoning.capability)],
      ["knorvia.model_attempt.reasoning_requested_state", () => safeEnum(reasoning.requestedState)],
      [
        "knorvia.model_attempt.reasoning_requested_control",
        () => safeEnum(reasoning.requestedControl),
      ],
      [
        "knorvia.model_attempt.reasoning_requested_level",
        () => safeString(reasoning.requestedLevel, 128),
      ],
      [
        "knorvia.model_attempt.reasoning_requested_budget_tokens",
        () => integer(reasoning.requestedBudgetTokens),
      ],
    ],
    input,
    projection,
  );
}
