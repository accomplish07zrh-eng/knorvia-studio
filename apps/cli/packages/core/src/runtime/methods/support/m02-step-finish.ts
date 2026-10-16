// SPDX-License-Identifier: Apache-2.0
// 工具步收尾：先落 step-finish 分部，再回写助手消息。
import { createPartId, type MessageId, type TraceContext } from "../../deps.js";
import { toTokenUsageInfo } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelTextResult } from "../../types.js";
import { type Col } from "./m02-record.js";
import type { RegularTurnLoopState } from "../turn-loop-state.js";

const MISSING_MODEL = "Model-backed turn step finish requires the loop Model";

type FinishRequest = Col<"assistantCreatedAt", number> &
  Col<"assistantMessageId", MessageId> &
  Col<"modelTraceContext", TraceContext> &
  Col<"result", RuntimeModelTextResult>;

function finishPart(
  host: AgentRuntimeInternal,
  request: FinishRequest,
  tokens: ReturnType<typeof toTokenUsageInfo>,
) {
  const { sessionId } = host;
  const { assistantMessageId, result } = request;
  return {
    id: createPartId(),
    sessionID: sessionId,
    messageID: assistantMessageId,
    type: "step-finish" as const,
    reason: result.finishReason,
    cost: 0,
    tokens,
  };
}

function assistantClosure(finish: string, tokens: ReturnType<typeof toTokenUsageInfo>) {
  return { completed: Date.now(), finish, tokens };
}

export async function persistToolModelStepFinish(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  request: FinishRequest,
): Promise<void> {
  const selected = loop.model;
  if (!selected) throw new Error(MISSING_MODEL);
  // 分部和消息各算一次用量。两次调用得到两份对象，后面改其中一份不会牵动另一份。
  await host.persistPart(
    finishPart(host, request, toTokenUsageInfo(request.result.usage)) as never,
    request.modelTraceContext,
  );
  await host.persistAssistantMessage(
    request.assistantMessageId,
    loop.currentUserMessageId,
    request.assistantCreatedAt,
    assistantClosure(request.result.finishReason, toTokenUsageInfo(request.result.usage)),
    request.modelTraceContext,
    selected,
  );
}
