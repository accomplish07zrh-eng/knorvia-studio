// SPDX-License-Identifier: Apache-2.0
// Metric 出口。Span 承载高基数细节，Metric 只接受低基数标签：
// 哪张白名单属于哪一种记录，全部来自 span-specs 的规格表，本模块不自建第二份。
import type { Attributes, Counter, Histogram, Meter } from "@opentelemetry/api";
import type {
  AgentMetricSpanName,
  AgentTelemetryMetricRecorder,
  ModelAttemptMetricsDetail,
  ModelTokenType,
} from "./metrics-contract.js";
import { SPAN_SPECS } from "./span-specs.js";

export type { AgentMetricSpanName, AgentTelemetryMetricRecorder, ModelTokenType };
export { NOOP_AGENT_TELEMETRY_METRICS } from "./noop-metrics.js";

/** 时长类指标统一按秒报；这个单位是看板口径的一部分。 */
const SECONDS = "s";

/** 每个 Span 的时长直方图名：名字里带 span 段，便于按种类查询。 */
function durationName(spanName: AgentMetricSpanName): string {
  return `knorvia.${spanName.replaceAll("_", ".")}.duration`;
}

/** 非时长的指标规格：名字、性质、单位与一句说明。 */
interface InstrumentSpec {
  description: string;
  isCounter: boolean;
  name: string;
  unit: string;
}

const ATTEMPTS = "knorvia.model.call.attempts";
const TOKENS = "knorvia.model.attempt.tokens";
const FIRST = {
  content: "knorvia.model.attempt.time_to_first_content",
  providerEvent: "knorvia.model.attempt.time_to_first_provider_event",
  text: "knorvia.model.attempt.time_to_first_text",
} as const;
const STALLS = "knorvia.model.attempt.stream_stall.count";
const MAX_IDLE = "knorvia.model.attempt.stream_max_idle";
const FIRST_OUTPUT = "knorvia.command.execution.time_to_first_output";
const CREATION_DROP = "knorvia.telemetry.creation_drop.count";
const ABANDONED = "knorvia.telemetry.abandoned.count";

const EXTRA_INSTRUMENTS: readonly InstrumentSpec[] = [
  [
    "Logical model calls and how many physical attempts each one needed",
    false,
    ATTEMPTS,
    "{attempt}",
  ],
  ["Provider-reported token delta, split by token type", true, TOKENS, "{token}"],
  ["Seconds from attempt start to the first provider event", false, FIRST.providerEvent, SECONDS],
  ["Seconds from attempt start to the first content chunk", false, FIRST.content, SECONDS],
  ["Seconds from attempt start to the first text chunk", false, FIRST.text, SECONDS],
  ["Stream stalls observed on one attempt", true, STALLS, "{stall}"],
  ["Longest observed stream idle time in seconds", false, MAX_IDLE, SECONDS],
  ["Seconds from command start to the first output byte", false, FIRST_OUTPUT, SECONDS],
  [
    "Spans refused before creation because the writer budget was full",
    true,
    CREATION_DROP,
    "{span}",
  ],
  ["Spans that ended without a terminal state", true, ABANDONED, "{span}"],
].map(([description, isCounter, name, unit]) => ({
  description: description as string,
  isCounter: isCounter as boolean,
  name: name as string,
  unit: unit as string,
}));

/** 计数器标签：两组固定两元组，与 Span 规格表分开登记。 */
const COUNTER_TAGS = {
  abandoned: ["abandon_reason", "span_name"],
  creationDrop: ["drop_reason", "span_name"],
} as const;

/** token 计数的标签：model_attempt 的白名单 + token_type。 */
const TOKEN_TAGS = [...SPAN_SPECS.model_attempt.labels, "token_type"];

/**
 * 白名单投影：覆盖值优先于原标签，空串与 undefined 不写。
 * 这是标签离开进程前的最后一道闸门。
 */
function select(
  labels: Attributes,
  allowed: readonly string[],
  overrides: Attributes = {},
): Attributes {
  const chosen: Attributes = {};
  for (const key of allowed) {
    const value = key in overrides ? overrides[key] : labels[key];
    if (value === undefined || value === "") continue;
    chosen[key] = value;
  }
  return chosen;
}

/**
 * OTel 指标记录器。
 * 每个方法都是「一次记录」：不做聚合、不做重试；异常由调用方（运行时）兜住。
 */
export class OtelAgentTelemetryMetrics implements AgentTelemetryMetricRecorder {
  readonly #counters = new Map<string, Counter>();
  readonly #histograms = new Map<string, Histogram>();

  constructor(meter: Meter) {
    for (const spanName of Object.keys(SPAN_SPECS) as AgentMetricSpanName[]) {
      const name = durationName(spanName);
      this.#histograms.set(
        name,
        meter.createHistogram(name, { description: `Elapsed seconds of ${name}`, unit: SECONDS }),
      );
    }
    for (const spec of EXTRA_INSTRUMENTS) {
      const options = { description: spec.description, unit: spec.unit };
      if (spec.isCounter) this.#counters.set(spec.name, meter.createCounter(spec.name, options));
      else this.#histograms.set(spec.name, meter.createHistogram(spec.name, options));
    }
  }

  recordSpanTerminal(
    spanName: AgentMetricSpanName,
    outcome: string,
    durationMs: number,
    labels: Attributes,
    abandonReason?: string,
  ): void {
    this.#histograms
      .get(durationName(spanName))
      ?.record(durationMs / 1_000, select(labels, SPAN_SPECS[spanName].labels, { outcome }));
    if (outcome !== "abandoned") return;
    this.#counters
      .get(ABANDONED)
      ?.add(
        1,
        select({ abandon_reason: abandonReason, span_name: spanName }, COUNTER_TAGS.abandoned),
      );
  }

  recordCreationDrop(spanName: AgentMetricSpanName, reason: "process_capacity" | "unknown"): void {
    this.#counters
      .get(CREATION_DROP)
      ?.add(1, select({ drop_reason: reason, span_name: spanName }, COUNTER_TAGS.creationDrop));
  }

  recordModelCallAttempts(attemptCount: number, labels: Attributes): void {
    this.#histograms
      .get(ATTEMPTS)
      ?.record(attemptCount, select(labels, SPAN_SPECS.model_call.labels));
  }

  recordModelTokenDelta(tokenType: ModelTokenType, delta: number, labels: Attributes): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.#counters.get(TOKENS)?.add(delta, select(labels, TOKEN_TAGS, { token_type: tokenType }));
  }

  recordModelAttemptDetail(labels: Attributes, detail: ModelAttemptMetricsDetail): void {
    const scope = select(labels, SPAN_SPECS.model_attempt.labels);
    const timings: ReadonlyArray<readonly [string, number | undefined]> = [
      [FIRST.providerEvent, detail.firstProviderEventMs],
      [FIRST.content, detail.firstContentMs],
      [FIRST.text, detail.firstTextMs],
    ];
    for (const [name, value] of timings) {
      if (value === undefined) continue;
      this.#histograms.get(name)?.record(value / 1_000, scope);
    }
    if (detail.stallCount <= 0) return;
    this.#counters.get(STALLS)?.add(detail.stallCount, scope);
    this.#histograms.get(MAX_IDLE)?.record(detail.streamMaxIdleMs / 1_000, scope);
  }

  recordCommandFirstOutput(durationMs: number, labels: Attributes): void {
    this.#histograms
      .get(FIRST_OUTPUT)
      ?.record(durationMs / 1_000, select(labels, SPAN_SPECS.command_execution.labels));
  }
}
