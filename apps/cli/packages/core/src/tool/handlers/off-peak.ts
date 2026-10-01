// ============================================================
// Off-Peak Tool Handlers
// ============================================================
// 与 cron.ts 兄弟并列。关键差异（勿照抄 cron 的防御方向）：
// - deny 边界是「闲时派发轮」（context.offPeakTurn），不是 automation 轮——
//   cron automation 自动轮明确放行 OffPeakCreate（定时派生闲时任务）。
// - create 走判别联合结果：额度(3103)/资格(3101)等业务失败由 host 分类后跨协议保真，
//   此处翻译为稳定的 CoreError，模型据此向用户转述可行动信息。

import {
  CoreErrorType,
  createCoreError,
  OffPeakCreateInputJsonSchema,
  OffPeakCreateInputSchema,
  OffPeakCreateOutputJsonSchema,
  OffPeakCreateOutputSchema,
  OffPeakListInputJsonSchema,
  OffPeakListInputSchema,
  OffPeakListOutputJsonSchema,
  OffPeakListOutputSchema,
  type ToolPermissionSpec,
} from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext } from "../types.js";
import { createOffPeakCreateHandler, executeOffPeakList } from "./off-peak-execution.js";

const OFF_PEAK_TOOL_TIMEOUT_MS = 30_000;
const OFF_PEAK_MODEL_BYTES = 32_000;

/**
 * 闲时派发轮的 handler 级拒绝（turn denylist 之外的第二层纵深）。
 * provider denylist 只是可见性约束；异常 provider 仍可能直接提交。handler 以
 * executor 传入的本轮事实做最终拒绝。注意：刻意不检查 automationTurn（cron 轮放行）。
 * SendMessage / Workflow 复用本函数——它们会绕开本轮 modelExecution 重新启动子 Agent
 * 并落到用户套餐；拒绝时给模型可恢复的替代路径提示。
 */
export function assertNotOffPeakTurn(
  context: ToolExecutionContext,
  toolName: string,
  options?: { hint?: string; recoverable?: boolean },
): void {
  if (!context.offPeakTurn) return;
  const hint = options?.hint ? ` ${options.hint}` : "";
  throw createCoreError(
    CoreErrorType.PermissionDenied,
    `${toolName} is not allowed while running an idle-time task.${hint}`,
    {
      context: {
        toolCallId: context.toolCallId,
        toolName,
      },
      recoverable: options?.recoverable ?? false,
      retryable: false,
    },
  );
}

const offPeakCreateHandler = createOffPeakCreateHandler(assertNotOffPeakTurn);
const offPeakListHandler = executeOffPeakList;

function offPeakPermission(
  permission: string,
  reason: string,
  needsApproval: boolean,
): ToolPermissionSpec {
  return {
    permission,
    reason,
    riskLevel: "medium" as const,
    sideEffectScope: "workspace" as const,
    needsApproval,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: needsApproval ? undefined : ["toolName"],
    denyPriority: "beforeAsk" as const,
  };
}

const offPeakResultBudget = {
  maxInlineBytes: OFF_PEAK_MODEL_BYTES,
  maxModelBytes: OFF_PEAK_MODEL_BYTES,
  strategy: "truncate" as const,
  preview: {
    maxBytes: OFF_PEAK_MODEL_BYTES,
    direction: "head" as const,
  },
};

const offPeakTimeout = {
  defaultMs: OFF_PEAK_TOOL_TIMEOUT_MS,
  maxMs: OFF_PEAK_TOOL_TIMEOUT_MS,
  allowCallOverride: false,
};

export const offPeakCreateToolEntry: ToolEntry = {
  capability: "Create an idle-time task queued for free off-peak execution",
  metadata: {
    name: "OffPeakCreate",
    description:
      "Create a one-off idle-time task in the current workspace: it takes a queue ticket immediately and later runs unattended in THIS session (with the full conversation history) when the server grants off-peak compute, at no plan-quota cost. There is no guaranteed start time. Unlike CronCreate (recurring or clock-scheduled work), use this for deferrable work the user wants done cheaply 'when compute is idle'. The prompt must describe the final work directly and must never ask the run to create, schedule, or configure another idle-time task or automation.",
    modelInstructions: [
      "Use this only when the user explicitly asks for idle-time/off-peak execution (闲时任务/闲时执行/低峰跑), or explicitly accepts deferring the work to the free idle-time queue.",
      "Choose CronCreate instead for anything time-scheduled or recurring ('every day at 9', 'in 10 minutes'). OffPeakCreate has no clock: the server decides when the task starts.",
      "The task later continues THIS conversation unattended with the full history available, so prompt may refer to context already established here; still state the expected deliverable explicitly because nobody will answer questions during the run.",
      "By default the task runs in full-automatic mode with the default allowed model at the highest reasoning level. Only set permissionMode/model/thoughtLevel when the user explicitly asks for confirmation-gated execution, a specific model, or a lower reasoning effort.",
      "Do not include workspace paths or identities in the input; the current session workspace is used.",
      "Keep title concise and task-descriptive without file paths.",
      "Creation consumes a limited free take-number quota. If creation fails with a quota error, relay the limit to the user instead of retrying.",
      "After a successful creation, reply with only a brief confirmation; the UI renders a task card with a link to the Automations page for edits.",
      "Never call OffPeakCreate from within an idle-time task run, and never write a prompt asking the run to create more idle-time tasks or automations.",
    ],
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: OFF_PEAK_TOOL_TIMEOUT_MS,
    maxOutputBytes: OFF_PEAK_MODEL_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: offPeakCreateHandler,
  inputSchema: OffPeakCreateInputJsonSchema,
  outputSchema: OffPeakCreateOutputJsonSchema,
  runtimeInputSchema: OffPeakCreateInputSchema,
  runtimeOutputSchema: OffPeakCreateOutputSchema,
  permission: offPeakPermission(
    "offpeak.create",
    "OffPeakCreate queues an unattended idle-time task and consumes a free take-number quota",
    true,
  ),
  resultBudget: offPeakResultBudget,
  timeout: offPeakTimeout,
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "OffPeakCreate was cancelled before the idle-time task was created",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

export const offPeakListToolEntry: ToolEntry = {
  capability: "List idle-time tasks for the current workspace",
  metadata: {
    name: "OffPeakList",
    description:
      "List idle-time tasks in the current workspace with status and queue position. Read-only.",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: OFF_PEAK_TOOL_TIMEOUT_MS,
    maxOutputBytes: OFF_PEAK_MODEL_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: offPeakListHandler,
  inputSchema: OffPeakListInputJsonSchema,
  outputSchema: OffPeakListOutputJsonSchema,
  runtimeInputSchema: OffPeakListInputSchema,
  runtimeOutputSchema: OffPeakListOutputSchema,
  permission: {
    permission: "offpeak.read",
    reason: "OffPeakList only reads idle-time tasks for this workspace",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: offPeakResultBudget,
  timeout: offPeakTimeout,
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "OffPeakList was cancelled before idle-time tasks were returned",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
