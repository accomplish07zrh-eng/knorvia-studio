import {
  TASK_OUTPUT_ALIASES,
  TASK_OUTPUT_PROVIDER_DESCRIPTION,
  TASK_OUTPUT_TOOL_NAME,
  TaskOutputInputSchema,
  TaskOutputResultSchema,
  TaskOutputResultJsonSchema,
  TaskOutputInputJsonSchema,
} from "@knorvia/contracts";
import { formatPersistedOutputEnvelope } from "../result-persistence-format.js";
import type { ToolEntry, ToolPersistedModelContentInput } from "../types.js";
import { formatCompactFileSize } from "./task-output-projection.js";

import { executeTaskOutput, validateTaskOutputRequest } from "./task-output-request.js";

const TASK_OUTPUT_DEFAULT_LENGTH = 32_000;
const TASK_OUTPUT_MAX_LENGTH = 160_000;
const TASK_OUTPUT_PERSIST_THRESHOLD_CHARS = 100_000;
const TASK_OUTPUT_RESULT_BUDGET_BYTES = 400_000;
const TASK_OUTPUT_PERSIST_PREVIEW_CHARS = 2_000;

export const taskOutputToolEntry: ToolEntry = {
  aliases: TASK_OUTPUT_ALIASES,
  capability: "read output/logs from a background task",
  maxModelChars: TASK_OUTPUT_PERSIST_THRESHOLD_CHARS,
  metadata: {
    name: TASK_OUTPUT_TOOL_NAME,
    description: TASK_OUTPUT_PROVIDER_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    maxOutputBytes: TASK_OUTPUT_RESULT_BUDGET_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: executeTaskOutput,
  validateInput: validateTaskOutputRequest,
  formatModelContent: formatTaskOutputModelContent,
  formatPersistedModelContent: formatPersistedTaskOutputModelContent,
  inputSchema: TaskOutputInputJsonSchema,
  outputSchema: TaskOutputResultJsonSchema,
  runtimeInputSchema: TaskOutputInputSchema,
  runtimeOutputSchema: TaskOutputResultSchema,
  permission: {
    permission: "taskOutput",
    reason: "TaskOutput reads a background task from the current runtime",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: TASK_OUTPUT_RESULT_BUDGET_BYTES,
    maxModelBytes: TASK_OUTPUT_RESULT_BUDGET_BYTES,
    strategy: "artifact",
    preview: {
      maxBytes: TASK_OUTPUT_RESULT_BUDGET_BYTES,
      direction: "head",
    },
    artifact: {
      enabled: true,
      retention: "session",
    },
  },
  resultArtifactContentType: "text/plain",
  timeout: {
    kind: "none",
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "TaskOutput was cancelled while waiting for the task",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

function formatTaskOutputModelContent(output: unknown): string {
  const parsed = TaskOutputResultSchema.parse(output);
  const blocks = [`<retrieval_status>${parsed.retrieval_status}</retrieval_status>`];
  const task = parsed.task;
  if (task) {
    blocks.push(`<task_id>${task.task_id}</task_id>`);
    blocks.push(`<task_type>${task.task_type}</task_type>`);
    blocks.push(`<status>${task.status}</status>`);
    if (task.exitCode !== undefined && task.exitCode !== null) {
      blocks.push(`<exit_code>${task.exitCode}</exit_code>`);
    }
    if (task.output.trim()) {
      // 没有真实完整文件时，task_id 不是可读取路径，不能把它伪装成
      // “Full output”；此时保留原文，由外层的大结果 artifact 机制继续处理。
      const content = (
        task.outputFile ? truncateTaskOutput(task.output, task.outputFile) : task.output
      ).trimEnd();
      blocks.push(`<output>\n${content}\n</output>`);
    }
    if (task.error) {
      blocks.push(`<error>${task.error}</error>`);
    }
  }
  return blocks.join("\n\n");
}

function truncateTaskOutput(
  output: string,
  outputPath: string,
  configuredValue = process.env.TASK_MAX_OUTPUT_LENGTH,
): string {
  const maxLength = resolveTaskOutputLength(configuredValue);
  if (output.length <= maxLength) return output;

  const prefix = `[Truncated. Full output: ${outputPath}]\n\n`;
  const tailLength = maxLength - prefix.length;
  return prefix + output.slice(-tailLength);
}

function resolveTaskOutputLength(configuredValue = process.env.TASK_MAX_OUTPUT_LENGTH): number {
  if (!configuredValue) return TASK_OUTPUT_DEFAULT_LENGTH;
  const parsed = Number.parseInt(configuredValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return TASK_OUTPUT_DEFAULT_LENGTH;
  return Math.min(parsed, TASK_OUTPUT_MAX_LENGTH);
}

function formatPersistedTaskOutputModelContent(input: ToolPersistedModelContentInput): string {
  return formatPersistedOutputEnvelope({
    content: input.content,
    formatBytes: formatCompactFileSize,
    originalBytes: input.content.length,
    persistedPath: input.persistedPath,
    previewChars: TASK_OUTPUT_PERSIST_PREVIEW_CHARS,
  });
}
