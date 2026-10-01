// Source-exposed Agent invocation; configuration error prose and guard contracts are retained.
import {
  AgentErrorCode,
  AgentInputSchema,
  AgentType,
  CoreErrorType,
  createCoreError,
  type AgentInput,
} from "@knorvia/contracts";
import type { ToolHandler } from "../types.js";
import { agentLaunchFrame } from "./agent-request.js";

export const invokeAgent: ToolHandler = async (input, context) => {
  const parsed = AgentInputSchema.parse(input) as AgentInput;
  const agentType = parsed.subagent_type ?? AgentType.GeneralPurpose;
  if (!context.subagentPort) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "SubagentPort is not configured for Agent tool",
      {
        context: {
          code: AgentErrorCode.SUBAGENT_UNAVAILABLE,
          toolCallId: context.toolCallId,
          toolName: "Agent",
        },
        recoverable: false,
      },
    );
  }
  const request = agentLaunchFrame(parsed, agentType, context);
  // 保留第二次端口读取、方法 receiver 及方法 getter 先于 options 的求值；这里唯一一次 launch。
  return context.subagentPort.launch(
    { ...request, runInBackground: parsed.run_in_background === true },
    {
      signal: context.abortSignal,
      ...(context.model ? { model: context.model } : {}),
      ...(context.subagentModelOverride ? { modelOverride: context.subagentModelOverride } : {}),
    },
  );
};
