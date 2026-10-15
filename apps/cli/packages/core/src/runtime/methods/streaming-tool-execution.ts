// SPDX-License-Identifier: Apache-2.0
// 流中工具执行入口：B20 管线在 support/during-stream-run.ts，这里保持兼容导出面。
import type { MessageId, Model, ModelToolCall, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import { runDuringStreamTool } from "./support/during-stream-run.js";

export async function executeStreamingTool(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  declaration: ModelToolCall,
  options: {
    assistantMessageId: MessageId;
    declarationIndex: number;
    model: Model;
    signal: AbortSignal;
    traceContext: TraceContext;
  },
): Promise<StreamedToolExecutionResult | undefined> {
  return runDuringStreamTool({ runtime, state, declaration, options });
}
