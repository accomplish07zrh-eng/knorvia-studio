// SPDX-License-Identifier: Apache-2.0
// 「开一个 Span」的全部机械动作：容量判断、创建、登记、回退、告警。
//
// 它被独立出来，是因为这套动作与具体 Span 种类无关：运行时提供 Tracer、活跃集合与指标
// 出口，这里按固定顺序串起来。顺序固定为「容量 → 建 Span → 建 writer → 登记 → 返回」；
// 任一步失败都回退 noop，失败原因折成一条告警。
import { SpanKind, type Span, type Tracer } from "@opentelemetry/api";
import type { AgentTelemetryAbandonReason } from "@knorvia/contracts/telemetry";
import type { AgentMetricSpanName, AgentTelemetryMetricRecorder } from "./agent-metrics.js";
import { SpanWriter, type Conclusion } from "./span-writer.js";
import type { SpanPlan } from "./span-plans.js";
import { NOOP_WRITERS } from "./noop-writers.js";
import type { WriterHealth } from "./writer-shapes.js";

/** 一次 Span 开启需要的外部依赖。 */
export interface SpanOpenerDeps {
  active: Set<RegisteredSpan>;
  health: WriterHealth;
  maxActive: number;
  metrics: AgentTelemetryMetricRecorder;
  tracer: Tracer;
}

/** 在册条目：一个 writer 核心，加上它的放弃入口。 */
export interface RegisteredSpan {
  core: SpanWriter;
  release(reason: AgentTelemetryAbandonReason): void;
}

/** 终态上报口：由运行时提供（它知道标签白名单与记录器）。 */
export type TerminalRecorder = (
  spanName: AgentMetricSpanName,
  core: SpanWriter,
  report: Conclusion,
) => void;

/** 容量告警的闩锁：同一轮只告警一次，容量恢复后重置。 */
export interface CapacityLatch {
  shown: boolean;
}

/** 一次开启的失败原因：容量不足，或创建过程抛错。 */
type OpenFailure = "create" | "no-capacity";

/**
 * 打开并登记一个 Span；失败时返回 undefined（调用方据此回退 noop）。
 * `wrap` 把 writer 核心包装成契约接口。
 */
export function openSpan<T>(
  deps: SpanOpenerDeps,
  latch: CapacityLatch,
  spanName: AgentMetricSpanName,
  plan: SpanPlan,
  wrap: (core: SpanWriter) => T,
  onTerminal: TerminalRecorder,
): T | undefined {
  if (deps.active.size >= deps.maxActive) return reject(deps, latch, spanName, "no-capacity");
  latch.shown = false;
  try {
    return register(deps, spanName, plan, wrap, onTerminal);
  } catch {
    return reject(deps, latch, spanName, "create");
  }
}

/** 正常路径：建 Span、建核心、包成接口、登记。 */
function register<T>(
  deps: SpanOpenerDeps,
  spanName: AgentMetricSpanName,
  plan: SpanPlan,
  wrap: (core: SpanWriter) => T,
  onTerminal: TerminalRecorder,
): T {
  const span = deps.tracer.startSpan(
    spanName,
    {
      attributes: plan.attributes,
      kind: spanName === "model_attempt" ? SpanKind.CLIENT : SpanKind.INTERNAL,
      links: plan.links,
    },
    plan.context,
  );
  let entry: RegisteredSpan | undefined;
  // writer 核心与它的登记条目互相引用：核心终结时摘除条目，条目放弃时终结核心。
  const core = new SpanWriter({
    health: deps.health,
    labels: plan.labels,
    onRemove: () => {
      if (entry !== undefined) deps.active.delete(entry);
    },
    onTerminal: (report) => onTerminal(spanName, core, report),
    span: writerSpanOf(spanName, plan, span),
  });
  const writer = wrap(core);
  entry = { core, release: (reason) => core.abandonBy(reason) };
  deps.active.add(entry);
  return writer;
}

/** 失败路径的统一收尾：记 drop 指标、按需告警、返回 undefined。 */
function reject<T>(
  deps: SpanOpenerDeps,
  latch: CapacityLatch,
  spanName: AgentMetricSpanName,
  failure: OpenFailure,
): T | undefined {
  guardMetric(deps, () =>
    deps.metrics.recordCreationDrop(
      spanName,
      failure === "no-capacity" ? "process_capacity" : "unknown",
    ),
  );
  if (failure === "create") {
    warn(deps, "Telemetry writer creation failed", { errorType: "Error", spanName });
    return undefined;
  }
  if (latch.shown) return undefined;
  latch.shown = true;
  warn(deps, "Telemetry active writer capacity was reached", {
    activeWriterCount: deps.active.size,
    maxActiveWriters: deps.maxActive,
    spanName,
  });
  return undefined;
}

/** 计划的元数据 + Span 实例 → writer 的状态。 */
function writerSpanOf(
  spanName: AgentMetricSpanName,
  plan: SpanPlan,
  span: Span,
): ConstructorParameters<typeof SpanWriter>[0]["span"] {
  const metadata = plan.metadata;
  const inherited = plan.inherited;
  return {
    correlation: metadata?.correlation ?? inherited?.correlation,
    parent: metadata?.parent ?? inherited,
    parentContext: plan.context,
    span,
    spanName,
    toolCallId: metadata?.toolCallId ?? inherited?.toolCallId,
  };
}

/** 未登记的 Span 一律回退 noop：调用方不需要判空。 */
export function noopFor<T>(spanName: AgentMetricSpanName): T {
  return NOOP_WRITERS[spanName] as T;
}

/** 指标调用失败只降级成一条告警。 */
export function guardMetric(deps: SpanOpenerDeps, record: () => void): void {
  try {
    record();
  } catch (error) {
    warn(deps, "Telemetry metric operation failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
}

/** 健康回调本身也属于旁路：它抛错同样不能外溢。 */
export function warn(
  deps: Pick<SpanOpenerDeps, "health">,
  message: string,
  context: Record<string, unknown>,
): void {
  try {
    deps.health.onWarning?.(message, context);
  } catch {
    // 观测旁路不反过来影响业务。
  }
}
