import type { InteractionRequestOrigin, SessionId, ToolCallId, TurnId } from "@knorvia/contracts";

export interface SubagentInteractionOriginContext {
  agentId: string;
  agentType: string;
  childSessionId: SessionId;
  description: string;
  parentSessionId: SessionId;
  parentToolCallId?: ToolCallId | string;
  parentTurnId?: TurnId;
}

export function buildSubagentInteractionOrigin(
  context: SubagentInteractionOriginContext,
  childTurnId?: TurnId,
  // 子代理交互请求的来源标记：父会话/父工具调用/父回合都带上，缺哪个就不出现哪个字段。
  // 字段插入顺序固定（可选项各自落在原有位置），下游按 JSON 键序比对时不会漂移。
): InteractionRequestOrigin {
  const origin: InteractionRequestOrigin = {
    kind: "subagent",
    agentId: context.agentId,
    agentType: context.agentType,
    childSessionId: context.childSessionId,
    ...(childTurnId ? { childTurnId } : {}),
    description: context.description,
    parentSessionId: context.parentSessionId,
    ...(context.parentToolCallId ? { parentToolCallId: context.parentToolCallId } : {}),
    ...(context.parentTurnId ? { parentTurnId: context.parentTurnId } : {}),
  };
  return origin;
}
