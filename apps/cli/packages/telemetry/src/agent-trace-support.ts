// SPDX-License-Identifier: Apache-2.0
// Writer 的公共底座：上下文锚点、因果搬运与取值闸门。
//
// 三件事的共同点：它们都只做「值的形状转换」，不持有状态。
//   - 锚点：把「当前在写哪个 Span」放进 OTel Context，子 Span 据此继承父级；
//   - 因果：把 Span 压成纯数据（或还原成 SpanContext），跨异步与进程边界保存；
//   - 闸门：外部给的字符串先过字符集与长度检查才进 Attribute。
//
// 本模块是合同冻结的包内接口面（interface.md 逐一列出这些名字），实现就在此处。
import * as otel from "@opentelemetry/api";
import type { Context, Link, SpanContext } from "@opentelemetry/api";
import type {
  AgentTelemetryCausation,
  AgentTelemetryExecutionContext,
} from "@knorvia/contracts/telemetry";
import type { ActiveWriterContext } from "./writer-shapes.js";

/** 锚点键：名字带版本，语义变化时换新键，而不是改旧值的形状。 */
const ANCHOR_KEY = otel.createContextKey("@knorvia/telemetry/active-writer-v4");

/** 当前 Context 上登记的 writer 状态（没有 writer 时是 undefined）。 */
export function activeWriterContext(): ActiveWriterContext | undefined {
  return otel.context.active().getValue(ANCHOR_KEY) as ActiveWriterContext | undefined;
}

/** 把 writer 的 Span 与自身状态一起写进 Context。 */
export function withWriterAnchor(parent: Context, state: ActiveWriterContext): Context {
  return otel.trace.setSpan(parent, state.span).setValue(ANCHOR_KEY, state);
}

/** 子 Span 的元数据：关联信息与工具调用标识都沿父级链继承。 */
export function inheritedMetadata(
  parent: ActiveWriterContext | undefined,
  spanName: string,
): Omit<ActiveWriterContext, "activeContext" | "span"> {
  const inherited: Partial<ActiveWriterContext> = { parent, spanName };
  inherited.correlation = parent?.correlation;
  inherited.toolCallId = parent?.toolCallId;
  return inherited as Omit<ActiveWriterContext, "activeContext" | "span">;
}

/** 因果引用的可选字段来源：哪些信息随引用一起走。 */
interface CausationExtras {
  correlation: AgentTelemetryExecutionContext | undefined;
  toolCallId: string | undefined;
}

/** 三种关系词：谁发起了这个独立根 Span。 */
export type LinkRelation = "resumed_from" | "spawned_by" | "triggered_by";

/** 可选字段：会话、轮次与工具调用各自是否存在，决定键写不写。 */
function causationExtras(extras: CausationExtras): Partial<AgentTelemetryCausation> {
  const carried: Partial<AgentTelemetryCausation> = {};
  const sessionId = extras.correlation?.sessionId;
  const turnId = extras.correlation?.turnId;
  if (sessionId !== undefined) carried.sessionId = sessionId;
  if (turnId !== undefined) carried.turnId = turnId;
  if (extras.toolCallId !== undefined) carried.toolCallId = extras.toolCallId;
  return carried;
}

/**
 * Span 状态 → 因果引用。
 * 五个 OTel 字段必写，traceState 与三条关联信息按存在与否附加。
 */
export function causationOf(
  spanContext: SpanContext,
  extras: CausationExtras,
): AgentTelemetryCausation | undefined {
  if (!otel.trace.isSpanContextValid(spanContext)) return undefined;
  const traceState = spanContext.traceState?.serialize();
  const carried: Partial<AgentTelemetryCausation> = causationExtras(extras);
  if (traceState !== undefined) carried.traceState = traceState;
  const ref: AgentTelemetryCausation = {
    isRemote: spanContext.isRemote === true,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
    traceId: spanContext.traceId,
  };
  return Object.assign(ref, carried);
}

/** 因果引用 → SpanContext；traceState 从序列化串还原。 */
export function spanContextFromCausation(causation: AgentTelemetryCausation): SpanContext {
  const { isRemote, spanId, traceFlags, traceId, traceState } = causation;
  const base: SpanContext = { isRemote, spanId, traceFlags, traceId };
  return traceState === undefined
    ? base
    : { ...base, traceState: otel.createTraceState(traceState) };
}

/**
 * 因果引用 → Context。
 * 基底固定 ROOT_CONTEXT：以执行时活跃的 Context 为底会把别的任务的 baggage 带进来。
 */
export function contextFromCausation(causation: AgentTelemetryCausation): Context {
  return otel.trace.setSpanContext(otel.ROOT_CONTEXT, spanContextFromCausation(causation));
}

/** 独立根 Span 与父运行的关联：父 SpanContext + 关系词。 */
export function causationLink(causation: AgentTelemetryCausation, relation: LinkRelation): Link {
  const link: Link = { attributes: {}, context: spanContextFromCausation(causation) };
  link.attributes!["knorvia.link.relation"] = relation;
  return link;
}

// 取值闸门的实现住在 gates.ts；这里只把它们汇到同一个公开面上。
export {
  compactAttributes,
  executionProjection,
  finiteNonNegative,
  integer,
  isAbortLike,
  safeEnum,
  safeId,
  safeIdentifier,
  safeString,
} from "./gates.js";
export { SpanWriter, lifecycleKeysOf, type Conclusion } from "./span-writer.js";
export type {
  ActiveWriterContext,
  WriterHealth,
  WriterLifecycleKeys,
  WriterSpan,
  WriterTerminalObservation,
} from "./writer-shapes.js";
