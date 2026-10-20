// SPDX-License-Identifier: Apache-2.0
// Writer 面的冻结形状：上下文锚点、健康回调、生命周期键与终态观测。
//
// 这些名字由合同 interface.md 逐一列出，属于兼容面。实现模块引用它们，
// 不再各自重复声明一遍；纯声明文件因此也不承担任何运行期行为。
import type { Context, Span, Tracer } from "@opentelemetry/api";
import type {
  AgentTelemetryExecutionContext,
  TelemetryIdentitySnapshot,
} from "@knorvia/contracts/telemetry";
import type { AgentTelemetryMetricRecorder } from "./metrics-contract.js";

/** Context 上登记的 writer 状态：谁在写、属于哪个会话/轮次/工具调用。 */
export interface ActiveWriterContext {
  activeContext: Context;
  correlation?: AgentTelemetryExecutionContext;
  parent?: ActiveWriterContext;
  span: Span;
  spanName: string;
  toolCallId?: string;
}

/** 健康回调：观测旁路的告警出口。 */
export interface WriterHealth {
  onWarning?: (message: string, context: Record<string, unknown>) => void;
}

/** 终结时写入的八个带前缀属性键。 */
export interface WriterLifecycleKeys {
  abandonReason: string;
  cancelReason: string;
  errorCategory: string;
  errorCode: string;
  errorMessage: string;
  errorType: string;
  failureStage: string;
  outcome: string;
}

/** 终态观测：只有 Metric 需要的两个可选字段。 */
export interface WriterTerminalObservation {
  abandonReason?: string;
  errorCategory?: string;
}

/** 一个 Span 的上下文事实：位置、父级与关联信息。 */
export interface WriterSpan {
  correlation?: AgentTelemetryExecutionContext;
  parent?: ActiveWriterContext;
  parentContext: Context;
  span: Span;
  spanName: string;
  toolCallId?: string;
}

/** 运行时的构造入参：身份快照、容量、指标出口、告警口与 Tracer。 */
export interface AgentTraceRuntimeOptions {
  identity?: TelemetryIdentitySnapshot;
  maxActiveWriters?: number;
  metrics?: AgentTelemetryMetricRecorder;
  onWarning?: (message: string, context: Record<string, unknown>) => void;
  tracer: Tracer;
}
