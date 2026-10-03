import {
  TASK_STOP_TOOL_NAME,
  TaskStopInputJsonSchema,
  TaskStopInputSchema,
  TaskStopOutputJsonSchema,
  TaskStopOutputSchema,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";

import { executeTaskStop } from "./task-stop-request.js";

const MAX_TASK_STOP_MODEL_BYTES = 100_000;

// provider 请求直接使用 metadata.description，内部短说明会让模型看不到
// 参数、返回值和使用时机。capability 继续保留短说明。
const TASK_STOP_PROVIDER_DESCRIPTION = [
  "",
  "- Stops a running background task by its ID",
  "- Takes a task_id parameter identifying the task to stop",
  "- Returns a success or failure status",
  "- Use this tool when you need to terminate a long-running task",
  "",
].join("\n");

export const taskStopToolEntry: ToolEntry = {
  aliases: ["KillShell", "KillBash"],
  capability: "Stop a running background task by ID",
  metadata: {
    name: TASK_STOP_TOOL_NAME,
    description: TASK_STOP_PROVIDER_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 10000,
    maxOutputBytes: MAX_TASK_STOP_MODEL_BYTES,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: executeTaskStop,
  formatModelContent: formatTaskStopModelContent,
  inputSchema: TaskStopInputJsonSchema,
  outputSchema: TaskStopOutputJsonSchema,
  runtimeInputSchema: TaskStopInputSchema,
  runtimeOutputSchema: TaskStopOutputSchema,
  permission: {
    permission: "backgroundTask.stop",
    reason: "TaskStop stops a running background task in the current runtime",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_TASK_STOP_MODEL_BYTES,
    maxModelBytes: MAX_TASK_STOP_MODEL_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_TASK_STOP_MODEL_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 10000,
    maxMs: 10000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "TaskStop was cancelled before the stop request completed",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

function formatTaskStopModelContent(output: unknown): string {
  return JSON.stringify(TaskStopOutputSchema.parse(output));
}
