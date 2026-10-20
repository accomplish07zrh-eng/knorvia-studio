// SPDX-License-Identifier: Apache-2.0
// Metric 面的冻结形状：Span 名、token 种类与记录器接口。
// 合同把这些名字当作兼容面（interface.md 逐一列出），实现模块只引用它们。
import type { Attributes } from "@opentelemetry/api";

export type AgentMetricSpanName =
  | "agent_turn"
  | "agent_step"
  | "tool_execution"
  | "command_execution"
  | "context_compaction"
  | "detached_operation"
  | "model_call"
  | "model_attempt";

export type ModelTokenType = "input" | "output" | "reasoning" | "cache_read" | "cache_write";

/**
 * 一次尝试的首包与停滞事实。
 * 独立成名是因为它同时出现在记录器签名与 Writer 的终态投影里，重复展开会把签名撑成多行。
 */
export interface ModelAttemptMetricsDetail {
  firstContentMs?: number;
  firstProviderEventMs?: number;
  firstTextMs?: number;
  stallCount: number;
  streamMaxIdleMs: number;
}

/** 记录器的六个入口；每个 Span 种类与计数器各占一行。 */
export interface AgentTelemetryMetricRecorder {
  recordCommandFirstOutput(durationMs: number, labels: Attributes): void;
  recordCreationDrop(spanName: AgentMetricSpanName, reason: "process_capacity" | "unknown"): void;
  recordModelAttemptDetail(labels: Attributes, detail: ModelAttemptMetricsDetail): void;
  recordModelCallAttempts(attemptCount: number, labels: Attributes): void;
  recordModelTokenDelta(tokenType: ModelTokenType, delta: number, labels: Attributes): void;
  recordSpanTerminal(
    spanName: AgentMetricSpanName,
    outcome: string,
    durationMs: number,
    labels: Attributes,
    abandonReason?: string,
  ): void;
}
