// SPDX-License-Identifier: Apache-2.0
// 工具步收尾：先落 step-finish 分部，再回写助手消息。
import { createPartId, type MessageId, type TraceContext } from "../../deps.js";
import { toTokenUsageInfo } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelTextResult } from "../../types.js";
import { assignKeys, phrase } from "./m02-record.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";

const MISSING_MODEL = phrase(["Model-backed turn step finish ", "requires the loop Model"]);

interface FinishRequest {
  assistantCreatedAt: number; // 助手骨架创建时刻
  assistantMessageId: MessageId; // 正在收尾的助手消息
  modelTraceContext: TraceContext; // 本步追踪
  result: RuntimeModelTextResult; // 刚结束的模型结果
}

function finishPart(runtime: AgentRuntimeInternal, request: FinishRequest, tokens: ReturnType<typeof toTokenUsageInfo>) {
  const reason = request.result.finishReason;
  return assignKeys([
    ["id", createPartId()],
    ["sessionID", runtime.sessionId],
    ["messageID", request.assistantMessageId],
    ["type", "step-finish"],
    ["reason", reason],
    ["cost", 0],
    ["tokens", tokens],
  ]);
}

function assistantClosure(reason: string, tokens: ReturnType<typeof toTokenUsageInfo>) {
  return assignKeys([
    ["completed", Date.now()],
    ["finish", reason],
    ["tokens", tokens],
  ]);
}

export async function persistToolModelStepFinish(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: FinishRequest): Promise<void> {
  const selected = state.model;
  if (selected === undefined || selected === null) throw new Error(MISSING_MODEL);
  const tokens = toTokenUsageInfo(options.result.usage);
  const reason = options.result.finishReason;
  await runtime.persistPart(finishPart(runtime, options, tokens) as never, options.modelTraceContext);
  await runtime.persistAssistantMessage(options.assistantMessageId, state.currentUserMessageId, options.assistantCreatedAt, assistantClosure(reason, tokens), options.modelTraceContext, selected);
}
