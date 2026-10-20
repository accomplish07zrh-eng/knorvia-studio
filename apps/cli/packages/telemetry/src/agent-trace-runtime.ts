// SPDX-License-Identifier: Apache-2.0
// 进程级 Agent 执行遥测运行时。
//
// 它是 writer 的唯一所有者：谁在册、谁该被放弃、容量满了怎么办，都归这里。
// 八种 Span 的差异全部收进 span-plans（出生计划）与 writer-factories（接口形状）；
// 开 Span 的机械动作在 span-opener。本模块只做三件事：分派、登记集合、结算记账。
import type { Attributes } from "@opentelemetry/api";
import type {
  AgentExecutionTelemetryPort,
  AgentStepSpanWriter,
  AgentStepTraceStart,
  AgentTelemetryAbandonReason,
  AgentTelemetryCausation,
  AgentTelemetryExecutionContext,
  AgentTurnSpanWriter,
  AgentTurnTraceStart,
  CommandExecutionSpanWriter,
  CommandTraceStart,
  CompactionTraceStart,
  ContextCompactionSpanWriter,
  DetachedOperationSpanWriter,
  DetachedOperationTraceStart,
  ModelAttemptSpanWriter,
  ModelAttemptTraceStart,
  ModelCallSpanWriter,
  ModelCallTraceStart,
  ModelExecutionTelemetryPort,
  TelemetryIdentitySnapshot,
  ToolExecutionSpanWriter,
  ToolTraceStart,
} from "@knorvia/contracts/telemetry";
import {
  NOOP_AGENT_TELEMETRY_METRICS,
  type AgentMetricSpanName,
  type AgentTelemetryMetricRecorder,
} from "./agent-metrics.js";
import { activeWriterContext } from "./agent-trace-support.js";
import { compactAttributes } from "./gates.js";
import { pickLabels, SPAN_SPECS } from "./span-specs.js";
import { SpanWriter, type Conclusion } from "./span-writer.js";
import {
  guardMetric,
  noopFor,
  openSpan,
  warn,
  type CapacityLatch,
  type RegisteredSpan,
} from "./span-opener.js";
import {
  commandPlan,
  compactionPlan,
  detachedPlan,
  modelAttemptPlan,
  modelCallPlan,
  stepPlan,
  toolPlan,
  turnPlan,
  type SpanPlan,
} from "./span-plans.js";
import {
  commandWriter,
  compactionWriter,
  detachedWriter,
  modelAttemptWriter,
  modelCallWriter,
  stepWriter,
  toolWriter,
  turnWriter,
} from "./writer-factories.js";
import type { ModelCallState } from "./writer-factories.js";
import { NoopAgentExecutionTelemetry } from "./noop-writers.js";
import type { AgentTraceRuntimeOptions } from "./writer-shapes.js";

export type { AgentTraceRuntimeOptions };

/** 默认活跃 writer 上限。 */
const ACTIVE_WRITER_LIMIT = 5_000;

/** 逻辑调用的可变状态：attempt 需要读写它。 */
class CallState implements ModelCallState {
  readonly identity: ModelCallState;
  readonly writer: SpanWriter;
  sawFailure = false;

  constructor(input: ModelCallTraceStart, writer: SpanWriter) {
    this.writer = writer;
    this.identity = {
      logicalCallId: input.logicalCallId.trim() || undefined,
      modelRole: input.modelRole?.trim() || undefined,
      operation: input.operation,
      noteAttemptFailed: () => this.noteAttemptFailed(),
    };
  }

  get logicalCallId(): string | undefined {
    return this.identity.logicalCallId;
  }

  get modelRole(): string | undefined {
    return this.identity.modelRole;
  }

  get operation(): string | undefined {
    return this.identity.operation;
  }

  noteAttemptFailed(): void {
    this.sawFailure = true;
  }
}

/**
 * 实现两个遥测端口：Agent 侧六种 Span 与模型侧两种。
 * 状态所有者：活跃集合、身份快照、容量告警闩锁。
 */
export class AgentExecutionTelemetryRuntime
  implements AgentExecutionTelemetryPort, ModelExecutionTelemetryPort
{
  readonly #active = new Set<RegisteredSpan>();
  readonly #latch: CapacityLatch = { shown: false };
  readonly #maxActive: number;
  readonly #metrics: AgentTelemetryMetricRecorder;
  readonly #onWarning: ((message: string, context: Record<string, unknown>) => void) | undefined;
  readonly #tracer: AgentTraceRuntimeOptions["tracer"];
  #identity: TelemetryIdentitySnapshot;

  constructor(options: AgentTraceRuntimeOptions) {
    this.#tracer = options.tracer;
    this.#maxActive = positiveLimit(options.maxActiveWriters, ACTIVE_WRITER_LIMIT);
    this.#onWarning = options.onWarning;
    this.#metrics = options.metrics ?? NOOP_AGENT_TELEMETRY_METRICS;
    this.#identity = options.identity ?? { identityState: "unknown" };
  }

  /** 身份只影响之后创建的 turn。 */
  updateIdentity(snapshot: TelemetryIdentitySnapshot): void {
    const user = snapshot.userSubjectId?.trim();
    const valid = user !== undefined && /^[A-Za-z0-9._:-]{1,128}$/u.test(user);
    this.#identity = {
      identityState: snapshot.identityState,
      ...(valid ? { userSubjectId: user } : {}),
    };
  }

  captureCausation(): AgentTelemetryCausation | undefined {
    const active = activeWriterContext();
    if (active === undefined) return undefined;
    // 只认在册 writer：Context 里可能残留已终结 writer 的锚点。
    for (const entry of this.#active) {
      if (entry.core.state.span === active.span) return entry.core.captureCausation();
    }
    return undefined;
  }

  startTurn(input: AgentTurnTraceStart): AgentTurnSpanWriter {
    return this.#open("agent_turn", turnPlan(input, this.#correlationOf(input)), (core) =>
      turnWriter(core),
    );
  }

  startStep(input: AgentStepTraceStart): AgentStepSpanWriter {
    return this.#open("agent_step", stepPlan(input, activeWriterContext()), (core) =>
      stepWriter(core),
    );
  }

  startTool(input: ToolTraceStart): ToolExecutionSpanWriter {
    const plan = toolPlan(input, activeWriterContext());
    return this.#open("tool_execution", plan, (core) =>
      toolWriter(core, (command) => this.#startCommand(command, core)),
    );
  }

  startCompaction(input: CompactionTraceStart): ContextCompactionSpanWriter {
    const plan = compactionPlan(input, activeWriterContext());
    return this.#open("context_compaction", plan, (core) => compactionWriter(core));
  }

  startDetachedOperation(input: DetachedOperationTraceStart): DetachedOperationSpanWriter {
    return this.#open("detached_operation", detachedPlan(input), (core) => detachedWriter(core));
  }

  startCall(input: ModelCallTraceStart): ModelCallSpanWriter {
    const plan = modelCallPlan(input, activeWriterContext());
    return this.#open("model_call", plan, (core) => {
      // 逻辑调用的状态同时承载它下面的多次 attempt：先建 state，再交出工厂。
      const state = new CallState(input, core);
      return modelCallWriter(core, (call, attempt) => this.#startAttempt(call, attempt), state);
    });
  }

  abandonSession(sessionId: string): void {
    for (const entry of [...this.#active]) {
      if (entry.core.state.correlation?.sessionId === sessionId) entry.release("session_shutdown");
    }
  }

  abandonProcess(): void {
    for (const entry of [...this.#active]) entry.release("process_shutdown");
  }

  /** 当前身份 + turn 自带的上下文。 */
  #correlationOf(input: AgentTurnTraceStart): AgentTelemetryExecutionContext {
    const { identityState, userSubjectId } = this.#identity;
    return {
      ...input.context,
      identityState,
      ...(userSubjectId === undefined ? {} : { userSubjectId }),
    };
  }

  /** command 子 Span：挂在发起它的 tool 核心下面。 */
  #startCommand(input: CommandTraceStart, tool: SpanWriter): CommandExecutionSpanWriter {
    const plan = commandPlan(input, tool.state);
    return this.#open("command_execution", plan, (core) => commandWriter(core, this.#metrics));
  }

  /** attempt 子 Span：挂在发起它的逻辑调用核心下面。 */
  #startAttempt(call: ModelCallState, input: ModelAttemptTraceStart): ModelAttemptSpanWriter {
    const plan = modelAttemptPlan(input, {
      logicalCallId: call.logicalCallId,
      modelRole: call.modelRole,
      operation: call.operation,
      writer: (call as CallState).writer.state,
    });
    return this.#open("model_attempt", plan, (core) =>
      modelAttemptWriter(core, this.#metrics, () => call.noteAttemptFailed()),
    );
  }

  /** 打开并登记一个 Span；失败一律回退 noop writer。 */
  #open<T>(spanName: AgentMetricSpanName, plan: SpanPlan, wrap: (core: SpanWriter) => T): T {
    const opened = openSpan(this.#openerDeps(), this.#latch, spanName, plan, wrap, (name, core) =>
      this.#settle(name, core),
    );
    return opened ?? noopFor<T>(spanName);
  }

  /** span-opener 需要的外部依赖：活跃集合、告警口、容量与 Tracer。 */
  #openerDeps() {
    return {
      active: this.#active,
      health: { onWarning: this.#onWarning },
      maxActive: this.#maxActive,
      metrics: this.#metrics,
      tracer: this.#tracer,
    };
  }

  /** 终态指标：标签按白名单收敛，outcome 作为位置参数单独传。 */
  #settle(spanName: AgentMetricSpanName, core: SpanWriter): void {
    const report: Conclusion = core.terminalReport();
    const allowed = SPAN_SPECS[spanName].labels.filter((label) => label !== "outcome");
    const labels: Attributes = pickLabels(
      core.labels,
      allowed,
      compactAttributes({ error_category: report.observation.errorCategory }),
    );
    guardMetric(this.#openerDeps(), () =>
      this.#metrics.recordSpanTerminal(
        spanName,
        report.outcome,
        report.durationMs,
        labels,
        report.observation.abandonReason,
      ),
    );
  }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

/** 告警口转发：健康回调只在这里被外部替换。 */
export function warnThrough(
  onWarning: AgentTraceRuntimeOptions["onWarning"],
  message: string,
  context: Record<string, unknown>,
): void {
  warn({ health: { onWarning } }, message, context);
}

// noop 实现在 noop-writers.ts；合同把本模块的导出面冻结在「运行时类 + Noop 类」两个名字上。
export { NoopAgentExecutionTelemetry, AgentTelemetryAbandonReason };
