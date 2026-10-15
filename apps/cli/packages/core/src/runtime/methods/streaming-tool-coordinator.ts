// SPDX-License-Identifier: Apache-2.0
// 流式工具协调器入口：声明/执行/收尾编排在 support/stream-tool-coordinator.ts，
// 这里保持兼容导出面。
import type { MessageId, Model, ModelToolCall, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import {
  buildStreamingCoordinator,
  type StreamingToolCoordinatorHandle,
} from "./support/stream-tool-coordinator.js";

interface StreamingToolCoordinator {
  accept(toolCall: ModelToolCall): void;
  abandon(reason: "cancelled" | "model_failed"): Promise<void>;
  drain(toolCalls: readonly ModelToolCall[]): Promise<StreamedToolExecutionResult[]>;
  recordReasoningDelta(text: string): void;
  recordTextDelta(text: string): void;
  recoverFromModelFailure(
    error: unknown,
    assistantCreatedAt: number,
    options?: { failedRequestId?: string },
  ): Promise<boolean>;
}

export function createStreamingToolCoordinator(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantMessageId: MessageId;
    model: Model;
    traceContext: TraceContext;
  },
): StreamingToolCoordinator {
  return buildStreamingCoordinator(runtime, state, options) as unknown as StreamingToolCoordinator;
}

export type { StreamingToolCoordinatorHandle };
