// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  createCoreError,
  type AgentTelemetryErrorCategory,
} from "@knorvia/contracts";
import {
  OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
  attestOfficialCuaFrameContent,
} from "@knorvia/cua/frame-contract";
import { hasOfficialCuaFrameAuthority } from "../../../mcp/image-normalization.js";
import type { HookRunResult } from "../../../hooks/index.js";
import type { ExecutableToolCall, ToolEntry, ToolResultSerialization } from "../../types.js";
import { createErrorResult, isToolHandlerFailureError } from "../errors.js";
import { formatHookAdditionalContexts } from "../hook-flow.js";
import { withAutomationCreateLimitTurnStop } from "../turn-control.js";

const FRAME_RESERVE = 256 * 1024;
export function serializationEntry(entry: ToolEntry, output: unknown): ToolEntry {
  const shared =
    entry.metadata.name === "mcp__node_repl__js" ||
    entry.metadata.mcpPresentation?.serverName === "node_repl";
  if (
    entry.modelContentProtection === OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION ||
    !shared ||
    !hasOfficialCuaFrameAuthority(output)
  )
    return entry;
  return {
    ...entry,
    modelContentProtection: OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
    resultBudget: {
      ...entry.resultBudget,
      maxInlineBytes: Math.max(entry.resultBudget.maxInlineBytes, FRAME_RESERVE),
      maxModelBytes: Math.max(entry.resultBudget.maxModelBytes, FRAME_RESERVE),
      strategy: "truncate",
      preview: { direction: "head" },
    },
  };
}
export function modelContent(serialization: ToolResultSerialization, entry: ToolEntry) {
  const content = serialization.modelContent ?? serialization.content;
  const proof = entry.modelContentProtection
    ? attestOfficialCuaFrameContent(content, entry.modelContentProtection)
    : undefined;
  if (
    entry.modelContentProtection &&
    Array.isArray(content) &&
    content.some((block) => block.type === "image") &&
    !proof
  )
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "Official CUA frame failed final model-content attestation",
      { recoverable: true },
    );
  return content;
}
const categories: Readonly<Record<string, AgentTelemetryErrorCategory>> = {
  [CoreErrorType.ConfigurationError]: "configuration",
  [CoreErrorType.ToolNotFound]: "configuration",
  [CoreErrorType.PermissionDenied]: "permission",
  [CoreErrorType.PermissionEscalation]: "permission",
  [CoreErrorType.PermissionTimeout]: "permission",
  [CoreErrorType.InvalidInput]: "parse",
  [CoreErrorType.ToolCancelled]: "cancelled",
  [CoreErrorType.ToolTimeout]: "timeout",
};
export function errorCategory(type?: string): AgentTelemetryErrorCategory {
  return type !== undefined && Object.hasOwn(categories, type) ? categories[type]! : "internal";
}
export function failedExecution(
  call: ExecutableToolCall,
  error: unknown,
  duration: number,
  pre: HookRunResult,
  failure: HookRunResult,
) {
  const result = createErrorResult(
    call,
    error instanceof Error ? error : new Error(String(error)),
    duration,
  );
  const body = result.error
    ? isToolHandlerFailureError(error) && typeof result.modelContent === "string"
      ? result.modelContent
      : result.error.message
    : undefined;
  // 错误规范化可能触发 getter；Hook 正文要在该动作之后读取，不能在函数参数中提前快照。
  if (failure.additionalContexts.length > 0 && body) {
    result.modelContent = `${body}\n\n${formatHookAdditionalContexts([...pre.additionalContexts, ...failure.additionalContexts])}`;
  } else if (pre.additionalContexts.length > 0 && body) {
    result.modelContent = `${body}\n\n${formatHookAdditionalContexts(pre.additionalContexts)}`;
  }
  return withAutomationCreateLimitTurnStop(result, { error, toolName: call.name });
}
