import type { ModelUsage } from "@knorvia/contracts";
import { formatTaskNotification } from "../runtime-task/notification.js";

const LOCAL_AGENT_NOTIFICATION_STATUSES = ["completed", "failed", "stopped"] as const;
type LocalAgentTaskNotificationStatus = (typeof LOCAL_AGENT_NOTIFICATION_STATUSES)[number];

interface LocalAgentTaskNotificationInput {
  agentId: string;
  agentType: string;
  description: string;
  error?: string;
  outputFile: string;
  parentToolCallId: string;
  result?: string;
  status: LocalAgentTaskNotificationStatus;
  totalDurationMs?: number;
  totalTokens?: number;
  totalToolUseCount?: number;
  usage?: ModelUsage;
}

export function formatLocalAgentTaskNotification(
  input: LocalAgentTaskNotificationInput,
): /* 返回一行摘要 */ string {
  // 该行会显示在 Agent 卡的「子智能体输出」里
  return formatTaskNotification({
    agentId: input.agentId,
    description: input.description,
    error: input.error,
    outputFile: input.outputFile,
    result: input.result,
    status: input.status,
    subagentType: input.agentType,
    summary: formatLocalAgentNotificationSummary(input),
    taskId: input.agentId,
    taskType: "local_agent",
    toolUseId: input.parentToolCallId,
    usage: /* 用量明细 */ {
      // 用量明细
      durationMs: input.totalDurationMs,
      modelUsage: input.usage,
      toolUseCount: input.totalToolUseCount,
      totalTokens: input.totalTokens,
    },
  });
}

function /* 摘要一行 */ formatLocalAgentNotificationSummary(
  // 摘要一行：Agent <类型> task "<描述>" <状态>
  input: Pick<LocalAgentTaskNotificationInput, "agentType" | "description" | "error" | "status">,
): /* 返回一行摘要 */ string {
  // 该行会显示在 Agent 卡的「子智能体输出」里
  const summary = `Agent ${input.agentType} task "${input.description}" ${input.status}.`;
  const error = input.status === "failed" && input.error?.trim() ? input.error : undefined;
  // 失败 summary 会显示在 Agent 卡的「子智能体输出」里，所以要保住原前缀，
  // 直接追加与 <error> 相同的失败原因；completed/stopped 文案保持不变。
  return error ? `${summary} ${error}` : summary;
}
