// SPDX-License-Identifier: Apache-2.0
// Writer 规格表：每种 Span 的结束词、失败阶段词表与 Metric 标签形状都登记在这里。
//
// 运行时不再逐类派生 writer：`startXxx` 只给出「这个 Span 属于哪一类、标签怎么算」，
// 由同一套工厂照着表拼出对象。新增一种 Span 是加一行数据，不是再加一个类。
import type { Attributes } from "@opentelemetry/api";
import type {
  CompactionTraceStart,
  DetachedOperationTraceStart,
  CommandTraceStart,
  ToolTraceStart,
} from "@knorvia/contracts/telemetry";
import type { AgentMetricSpanName } from "./agent-metrics.js";
import { compactAttributes, safeEnum, safeString } from "./gates.js";

/** 一种 Span 的记账规格。 */
export interface SpanSpec {
  /** 终态 Metric 允许的标签键。 */
  labels: readonly string[];
  /** 本种类上报终态指标时用的名字（与 Metric 表一一对应）。 */
  metricName: AgentMetricSpanName;
}

const COMMON = ["error_category", "outcome"] as const;
const COMMAND = [...COMMON, "command_category", "command_safe_name"] as const;
const MODEL_CALL = [
  ...COMMON,
  "call_cause",
  "model_operation",
  "model_role",
  "retry_state",
] as const;
const MODEL_ATTEMPT = [
  ...COMMON,
  "model",
  "model_operation",
  "model_role",
  "provider_kind",
  "transport",
] as const;

/** 八种 Span 的记账规格；键就是 `knorvia.<span>` 的 span 段。 */
export const SPAN_SPECS = {
  agent_step: { labels: [...COMMON, "actor_kind", "terminal_reason"], metricName: "agent_step" },
  agent_turn: {
    labels: [...COMMON, "actor_kind", "input_source", "launch_surface"],
    metricName: "agent_turn",
  },
  command_execution: { labels: [...COMMAND], metricName: "command_execution" },
  context_compaction: {
    labels: [...COMMON, "model_mode", "trigger"],
    metricName: "context_compaction",
  },
  detached_operation: {
    labels: [...COMMON, "execution_kind", "operation"],
    metricName: "detached_operation",
  },
  model_attempt: { labels: [...MODEL_ATTEMPT], metricName: "model_attempt" },
  model_call: { labels: [...MODEL_CALL], metricName: "model_call" },
  tool_execution: { labels: [...COMMON, "tool_name"], metricName: "tool_execution" },
} satisfies Record<AgentMetricSpanName, SpanSpec>;

/** 计数器类指标的标签（不参与终态白名单）。 */
export const COUNTER_LABELS = {
  abandoned: ["abandon_reason", "span_name"],
  creationDrop: ["drop_reason", "span_name"],
  tokens: ["model", "model_operation", "model_role", "provider_kind", "token_type", "transport"],
} as const;

/** 按白名单取值：覆盖优先，空串与 undefined 不写。 */
export function pickLabels(
  source: Attributes,
  allowed: readonly string[],
  overrides: Attributes = {},
): Attributes {
  const selected: Attributes = {};
  for (const key of allowed) {
    const value = key in overrides ? overrides[key] : source[key];
    if (value === undefined) continue;
    if (value === "") continue;
    selected[key] = value;
  }
  return selected;
}

/** 各种 Span 的 Metric 标签构造：只放低基数、已归一化的值。 */
export function labelsFor(
  spanName: AgentMetricSpanName,
  input: {
    actorKind?: string | undefined;
    command?: CommandTraceStart;
    compaction?: CompactionTraceStart;
    detached?: DetachedOperationTraceStart;
    inputSource?: string | undefined;
    launchSurface?: string | undefined;
    modelCall?: {
      callCause?: string | undefined;
      modelRole?: string | undefined;
      operation?: string | undefined;
    };
    modelAttempt?: {
      modelRole?: string | undefined;
      operation?: string | undefined;
      providerKind?: string | undefined;
      requestedModel?: string | undefined;
      transport?: string | undefined;
    };
    tool?: ToolTraceStart;
    toolName?: string | undefined;
  },
): Attributes {
  switch (spanName) {
    case "agent_turn":
      return compactAttributes({
        actor_kind: safeEnum(input.actorKind),
        input_source: safeEnum(input.inputSource),
        launch_surface: safeEnum(input.launchSurface),
      });
    case "agent_step":
      return compactAttributes({ actor_kind: safeEnum(input.actorKind) });
    case "tool_execution":
      return compactAttributes({ tool_name: safeString(input.toolName, 128) });
    case "command_execution":
      return compactAttributes({
        command_category: safeEnum(input.command?.category),
        command_safe_name: safeString(input.command?.safeName, 128),
      });
    case "context_compaction":
      return compactAttributes({
        model_mode: safeEnum(input.compaction?.modelMode),
        trigger: safeEnum(input.compaction?.trigger),
      });
    case "detached_operation":
      return compactAttributes({
        execution_kind: safeEnum(input.detached?.executionKind),
        operation: safeEnum(input.detached?.operation),
      });
    case "model_call":
      return compactAttributes({
        call_cause: safeEnum(input.modelCall?.callCause ?? "initial"),
        model_operation: safeEnum(input.modelCall?.operation),
        model_role: safeEnum(input.modelCall?.modelRole),
      });
    case "model_attempt":
      return compactAttributes({
        model: safeString(input.modelAttempt?.requestedModel, 128),
        model_operation: safeEnum(input.modelAttempt?.operation),
        model_role: safeEnum(input.modelAttempt?.modelRole),
        provider_kind: safeEnum(input.modelAttempt?.providerKind),
        transport: safeEnum(input.modelAttempt?.transport),
      });
    default:
      return {};
  }
}
