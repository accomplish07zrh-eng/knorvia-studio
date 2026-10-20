// SPDX-License-Identifier: Apache-2.0
// 每种 Span 的「出生计划」：开 Span 需要的位置、属性、标签与元数据，由输入一次性算好。
//
// 计划是纯数据 + 纯函数：运行时拿到计划后才碰 Tracer。这样 Span 种类的差异全在表里，
// 运行时只剩「容量判断 → 建 Span → 登记 → 回退」这一条主干。
import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import type { Attributes, Context, Link } from "@opentelemetry/api";
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
import { causationLink, contextFromCausation } from "./agent-trace-support.js";
import { labelsFor } from "./span-specs.js";
import type { ActiveWriterContext } from "./writer-shapes.js";
import {
  commandAttributes,
  compactionAttributes,
  detachedAttributes,
  modelAttemptAttributes,
  modelCallAttributes,
  stepAttributes,
  toolAttributes,
  turnAttributes,
} from "./span-attributes.js";

/** 一个 Span 的出生计划。 */
export interface SpanPlan {
  attributes: Attributes;
  context: Context;
  inherited?: ActiveWriterContext;
  labels: Attributes;
  links?: Link[];
  metadata?: Omit<ActiveWriterContext, "activeContext" | "span">;
}

/**
 * 因果归属的两种模式：
 * `child` 直接以父 Context 为底（延续同一链路）；独立根则以 ROOT 为底并用 Link 指回来源。
 */
function causationOf(
  causation: Parameters<typeof contextFromCausation>[0] | undefined,
  linkedRoot: boolean,
  relation: "resumed_from" | "spawned_by" | "triggered_by",
): { context: Context; links?: Link[] } {
  if (causation === undefined) return { context: ROOT_CONTEXT };
  if (!linkedRoot) return { context: contextFromCausation(causation) };
  return { context: ROOT_CONTEXT, links: [causationLink(causation, relation)] };
}

/** turn：独立根用 Link 指回父运行；子链路直接继承。 */
export function turnPlan(
  input: AgentTurnTraceStart,
  correlation: AgentTelemetryExecutionContext,
): SpanPlan {
  const spanned = causationOf(input.causation, input.causationMode !== "child", "spawned_by");
  return {
    attributes: turnAttributes(correlation, input),
    context: spanned.context,
    labels: labelsFor("agent_turn", {
      actorKind: correlation.actorKind,
      inputSource: input.inputSource,
      launchSurface: correlation.launchSurface,
    }),
    links: spanned.links,
    metadata: { correlation, spanName: "agent_turn" },
  };
}

/** step：永远是与父 writer 同链路。 */
export function stepPlan(
  input: AgentStepTraceStart,
  parent: ActiveWriterContext | undefined,
): SpanPlan {
  return {
    attributes: stepAttributes(parent?.correlation, input),
    context: parent?.activeContext ?? context.active(),
    inherited: parent,
    labels: labelsFor("agent_step", { actorKind: parent?.correlation?.actorKind }),
  };
}

/** tool：带上工具调用标识。 */
export function toolPlan(input: ToolTraceStart, parent: ActiveWriterContext | undefined): SpanPlan {
  return {
    attributes: toolAttributes(parent?.correlation, input),
    context: parent?.activeContext ?? context.active(),
    inherited: parent,
    labels: labelsFor("tool_execution", { toolName: input.registeredToolName }),
    metadata: {
      correlation: parent?.correlation,
      parent,
      spanName: "tool_execution",
      toolCallId: input.toolCallId.trim() || undefined,
    },
  };
}

/** command：挂在发起它的 tool 下面。 */
export function commandPlan(input: CommandTraceStart, tool: ActiveWriterContext): SpanPlan {
  return {
    attributes: commandAttributes(tool.correlation, tool.toolCallId, input),
    context: tool.activeContext,
    inherited: tool,
    labels: labelsFor("command_execution", { command: input }),
  };
}

/** compaction：与父 writer 同链路。 */
export function compactionPlan(
  input: CompactionTraceStart,
  parent: ActiveWriterContext | undefined,
): SpanPlan {
  return {
    attributes: compactionAttributes(parent?.correlation, input),
    context: parent?.activeContext ?? context.active(),
    inherited: parent,
    labels: labelsFor("context_compaction", { compaction: input }),
  };
}

/** detached：前台延续链路；排队/后台/调度作为独立根。 */
export function detachedPlan(input: DetachedOperationTraceStart): SpanPlan {
  const linkedRoot = input.executionKind !== "foreground";
  const spanned = causationOf(
    input.causation,
    linkedRoot,
    input.trigger === "recovery" ? "resumed_from" : "triggered_by",
  );
  return {
    attributes: detachedAttributes(input),
    context: spanned.context,
    labels: labelsFor("detached_operation", { detached: input }),
    links: spanned.links,
    metadata: { correlation: input.context, spanName: "detached_operation" },
  };
}

/** model_call：与父 writer 同链路。 */
export function modelCallPlan(
  input: ModelCallTraceStart,
  parent: ActiveWriterContext | undefined,
): SpanPlan {
  return {
    attributes: modelCallAttributes(parent?.correlation, input),
    context: parent?.activeContext ?? context.active(),
    inherited: parent,
    labels: labelsFor("model_call", {
      modelCall: {
        callCause: input.callCause,
        modelRole: input.modelRole,
        operation: input.operation,
      },
    }),
  };
}

/** attempt 挂在逻辑调用下面，operation 与角色由父调用给出。 */
export function modelAttemptPlan(
  input: ModelAttemptTraceStart,
  call: {
    logicalCallId: string | undefined;
    modelRole: string | undefined;
    operation: string | undefined;
    writer: ActiveWriterContext;
  },
): SpanPlan {
  return {
    attributes: modelAttemptAttributes(input, {
      correlation: call.writer.correlation,
      logicalCallId: call.logicalCallId,
      modelRole: call.modelRole,
      operation: call.operation,
      toolCallId: call.writer.toolCallId,
    }),
    context: call.writer.activeContext,
    inherited: call.writer,
    labels: labelsFor("model_attempt", {
      modelAttempt: {
        modelRole: call.modelRole,
        operation: call.operation,
        providerKind: input.target.providerKind,
        requestedModel: input.target.requestedModel,
        transport: input.transport,
      },
    }),
  };
}
