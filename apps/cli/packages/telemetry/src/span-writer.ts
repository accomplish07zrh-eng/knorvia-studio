// SPDX-License-Identifier: Apache-2.0
// 一个 Span 的相位机与写入面。
//
// 相位只有四个值，迁移由表决定：任何终结请求先过 `sealed` 闩锁，表外的迁移直接忽略。
// 这样「谁先结算谁生效」「终结后不再写」都不需要额外判断，也不会退化成若干布尔标志的组合。
import type { Attributes, Context, Span } from "@opentelemetry/api";
import * as otel from "@opentelemetry/api";
import type { AgentTelemetryAbandonReason } from "@knorvia/contracts/telemetry";
import { compactAttributes, safeEnum } from "./gates.js";
import { claimSanitizedTelemetryError } from "./error-sanitizer.js";
import { withWriterAnchor } from "./agent-trace-support.js";
import { causationOf } from "./agent-trace-support.js";
import type {
  ActiveWriterContext,
  WriterHealth,
  WriterLifecycleKeys,
  WriterSpan,
  WriterTerminalObservation,
} from "./writer-shapes.js";

export type {
  ActiveWriterContext,
  WriterHealth,
  WriterLifecycleKeys,
  WriterSpan,
  WriterTerminalObservation,
};

/** Span 的四个相位。 */
type Phase = "idle" | "open" | "returned" | "sealed";

/** 允许的迁移；表里没有的边一律忽略。 */
const MIGRATIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  idle: ["open", "sealed"],
  open: ["returned", "sealed"],
  returned: ["sealed"],
  sealed: [],
};

/** 单调时钟换算成毫秒。 */
function clockMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

/** 属性值的归一：字符串按 1KB 截断，数字去非有限值，数组要求同型。 */
function attributeOf(value: unknown): Attributes[string] | undefined {
  if (typeof value === "string") return value.length > 0 ? value.slice(0, 1_024) : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (!Array.isArray(value)) return undefined;
  const sample = value[0];
  if (sample === undefined) return undefined;
  if (!value.every((item) => typeof item === typeof sample)) return undefined;
  if (typeof sample === "number" && !value.every((item) => Number.isFinite(item))) return undefined;
  if (typeof sample === "string" || typeof sample === "number" || typeof sample === "boolean") {
    return value as string[] | number[] | boolean[];
  }
  return undefined;
}

function thenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  return typeof (value as { then?: unknown }).then === "function";
}

function abortLike(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return error.name === "AbortError" || code === "ABORT_ERR";
}

/** Context 执行器：默认用 OTel 的 `context.with`，测试可以替换成会抛错的实现。 */
let runInsideContext: <T>(ctx: Context, action: () => T) => T = (ctx, action) =>
  otel.context.with(ctx, action);

/** 替换 Context 执行器（测试注入激活/收尾故障时使用）。 */
export function configureContextRunner(runner: <T>(ctx: Context, action: () => T) => T): void {
  runInsideContext = runner;
}

/** 终态回调的实参包：一次终结的完整事实。 */
export interface Conclusion {
  durationMs: number;
  observation: WriterTerminalObservation;
  outcome: string;
}

export interface SpanWriterInit {
  /** 终结前最后一次写入的机会（首输出耗时一类事实）。 */
  beforeConclude?: (outcome: string) => void;
  health: WriterHealth;
  labels: Attributes;
  onRemove?: () => void;
  onTerminal?: (report: Conclusion) => void;
  span: WriterSpan;
}

/**
 * 一个 Span 的写入面：属性、事件、求值与终结。
 * 它不认识任何 Span 种类；语义来自调用点给的键与常量。
 */
export class SpanWriter {
  readonly keys: WriterLifecycleKeys;
  readonly labels: Attributes;
  readonly state: ActiveWriterContext;
  readonly #beforeConclude: SpanWriterInit["beforeConclude"];
  readonly #health: WriterHealth;
  readonly #onRemove: SpanWriterInit["onRemove"];
  readonly #onTerminal: SpanWriterInit["onTerminal"];
  readonly #openedAtMs = clockMs();
  #failure: unknown;
  #lastConclusion: Conclusion | undefined;
  #phase: Phase = "idle";
  #value: unknown;

  constructor(init: SpanWriterInit) {
    this.keys = lifecycleKeysOf(init.span.spanName);
    this.labels = init.labels;
    this.#beforeConclude = init.beforeConclude;
    this.#health = init.health;
    this.#onRemove = init.onRemove;
    this.#onTerminal = init.onTerminal;
    this.state = {
      activeContext: init.span.parentContext,
      correlation: init.span.correlation,
      parent: init.span.parent,
      span: init.span.span,
      spanName: init.span.spanName,
      toolCallId: init.span.toolCallId,
    };
    this.state.activeContext = withWriterAnchor(init.span.parentContext, this.state);
  }

  get span(): Span {
    return this.state.span;
  }

  get context(): Context {
    return this.state.activeContext;
  }

  get open(): boolean {
    return this.#phase !== "sealed";
  }

  captureCausation() {
    return causationOf(this.state.span.spanContext(), {
      correlation: this.state.correlation,
      toolCallId: this.state.toolCallId,
    });
  }

  /**
   * 业务求值的唯一入口。回调至多一次；激活失败仍跑一次；收尾失败保留返回值；
   * 返回后仍未终结即记 abandoned（missing_terminal）。
   */
  run<T>(execute: () => T, onUnhandled: (error: unknown) => void): T {
    let produced: T;
    try {
      produced = runInsideContext(this.state.activeContext, () => this.#evaluate(execute));
    } catch (error) {
      produced = this.#recoverContextFault(error, execute, onUnhandled);
    }
    if (!thenable(produced)) {
      this.finishAbandoned("missing_terminal");
      return produced;
    }
    return Promise.resolve(produced).then(
      (value) => {
        this.finishAbandoned("missing_terminal");
        return value;
      },
      (error: unknown) => {
        if (this.open) onUnhandled(error);
        throw error;
      },
    ) as T;
  }

  /** Context manager 故障的两种成因：还没开始（激活失败）与已经返回（收尾失败）。 */
  #recoverContextFault<T>(error: unknown, execute: () => T, onUnhandled: (e: unknown) => void): T {
    if (this.#phase === "returned") {
      this.warn("Telemetry context teardown failed", error);
      return this.#value as T;
    }
    if (this.#phase === "idle") {
      this.warn("Telemetry context activation failed", error);
      return this.#evaluate(execute);
    }
    if (this.open) onUnhandled(error);
    throw error;
  }

  /** 真正的业务求值：重复进入时返回上次值或重抛上次异常。 */
  #evaluate<T>(execute: () => T): T {
    if (this.#phase === "open") throw this.#failure;
    if (this.#phase !== "idle") return this.#value as T;
    this.#phase = "open";
    try {
      this.#value = execute();
    } catch (error) {
      this.#failure = error;
      throw error;
    }
    if (this.#phase === "open") this.#phase = "returned";
    return this.#value as T;
  }

  set(key: string, value: unknown): void {
    const normalized = attributeOf(value);
    if (normalized === undefined) return;
    this.guard(() => this.state.span.setAttribute(key, normalized));
  }

  setAll(attributes: Record<string, unknown>): void {
    for (const key of Object.keys(attributes)) this.set(key, attributes[key]);
  }

  event(name: string, attributes?: Attributes): void {
    this.guard(() => this.state.span.addEvent(name, compactAttributes(attributes ?? {})));
  }

  /** 领域自己的结束词（discarded / denied / backgrounded）。 */
  finishDomain(word: string, extra?: () => void): void {
    if (!this.#seal()) return;
    this.guard(extra);
    this.set(this.keys.outcome, safeEnum(word));
    this.#conclude(word, {});
  }

  finishCompleted(extra?: () => void): void {
    if (!this.#seal()) return;
    this.guard(extra);
    this.set(this.keys.outcome, "completed");
    this.guard(() => this.state.span.setStatus({ code: 1 }));
    this.#conclude("completed", {});
  }

  finishCancelled(reason: string): void {
    if (!this.#seal()) return;
    this.set(this.keys.outcome, "cancelled");
    this.set(this.keys.cancelReason, safeEnum(reason));
    this.#conclude("cancelled", {});
  }

  finishFailed(stage: string, category: string, error?: unknown): void {
    if (!this.#seal()) return;
    this.set(this.keys.outcome, "failed");
    this.set(this.keys.failureStage, safeEnum(stage));
    this.set(this.keys.errorCategory, safeEnum(category));
    if (error !== undefined) this.recordError(error);
    this.guard(() => this.state.span.setStatus({ code: 2 }));
    this.#conclude("failed", { errorCategory: safeEnum(category) });
  }

  finishAbandoned(reason: AgentTelemetryAbandonReason): void {
    if (!this.#seal()) return;
    this.set(this.keys.outcome, "abandoned");
    this.set(this.keys.abandonReason, reason);
    this.#conclude("abandoned", { abandonReason: reason });
  }

  /** 对外名字：会话/进程关闭时放弃在册 Span。 */
  abandonBy(reason: AgentTelemetryAbandonReason): void {
    this.finishAbandoned(reason);
  }

  /** 时钟读数：writer 工厂用它给「首输出」「首包」这类时间点打点。 */
  elapsed(): number {
    return Math.max(0, clockMs() - this.#openedAtMs);
  }

  /** 取消类异常走 cancelled，其余交给调用方给的分类。 */
  finishThrown(error: unknown, category: string, stage = "unhandled"): void {
    if (abortLike(error)) this.finishCancelled("abort_signal");
    else this.finishFailed(stage, category, error);
  }

  /** 认领式错误正文：同一条异常只在最靠近来源的 Span 上写一次。 */
  recordError(error: unknown): void {
    const sanitized = claimSanitizedTelemetryError(error);
    if (sanitized === undefined) return;
    this.set(this.keys.errorType, sanitized.type);
    this.set(this.keys.errorCode, sanitized.code);
    this.set(this.keys.errorMessage, sanitized.message);
    this.set("error.type", sanitized.type);
    this.set("error.message", sanitized.message);
    if (sanitized.cause === undefined) return;
    this.set("error.cause.type", sanitized.cause.type);
    this.set("error.cause.code", sanitized.cause.code);
    this.set("error.cause.message", sanitized.cause.message);
  }

  /** SDK 调用的隔离层：抛错只降级成一次告警。 */
  guard(action: (() => void) | undefined): void {
    if (action === undefined) return;
    try {
      action();
    } catch (error) {
      this.warn("Telemetry writer operation failed", error);
    }
  }

  warn(message: string, error: unknown): void {
    try {
      this.#health.onWarning?.(message, {
        errorType: error instanceof Error ? error.name : typeof error,
        spanName: this.state.spanName,
      });
    } catch {
      // 健康回调本身也属于旁路。
    }
  }

  /** 相位迁移：只走表里存在的边。 */
  #advance(next: Phase): boolean {
    if (!MIGRATIONS[this.#phase].includes(next)) return false;
    this.#phase = next;
    return true;
  }

  #seal(): boolean {
    return this.#advance("sealed");
  }

  /** 终结记账：摘除登记 → 收尾钩子 → 终态指标 → span.end()。 */
  #conclude(outcome: string, observation: WriterTerminalObservation): void {
    const durationMs = Math.max(0, clockMs() - this.#openedAtMs);
    this.#lastConclusion = { durationMs, observation, outcome };
    this.guard(this.#onRemove);
    this.guard(() => this.#beforeConclude?.(outcome));
    this.guard(() => this.#onTerminal?.(this.#lastConclusion!));
    this.guard(() => this.state.span.end());
  }

  /** 最近一次终结的事实：终态指标从这里取。 */
  terminalReport(): Conclusion {
    return this.#lastConclusion ?? { durationMs: 0, observation: {}, outcome: "abandoned" };
  }
}

/** 生命周期属性键的八个后缀；前缀由 Span 名给出。 */
const KEY_SUFFIXES = {
  abandonReason: "abandon_reason",
  cancelReason: "cancel_reason",
  errorCategory: "error_category",
  errorCode: "error_code",
  errorMessage: "error_message",
  errorType: "error_type",
  failureStage: "failure_stage",
  outcome: "outcome",
} as const;

/**
 * 生命周期键：`knorvia.<span>.<后缀>`。
 * 后缀表是数据，前缀在调用时拼——新增属性只要加一行后缀。
 */
export function lifecycleKeysOf(spanName: string): WriterLifecycleKeys {
  const names = Object.keys(KEY_SUFFIXES) as Array<keyof WriterLifecycleKeys>;
  const keys = {} as WriterLifecycleKeys;
  for (const name of names) keys[name] = `knorvia.${spanName}.${KEY_SUFFIXES[name]}`;
  return keys;
}
