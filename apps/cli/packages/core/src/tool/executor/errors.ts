// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { CoreErrorType, createCoreError, isCoreError } from "@knorvia/contracts";
import { projectExecutionErrorPayload } from "../../errors/error-payload.js";
import type { ExecutableToolCall, ToolExecutionResult, ToolHandlerFailure } from "../types.js";
import { getInitialInputValidationModelContent } from "./validation.js";

type Presentation = { preserveReasonFormatting?: boolean };
const FEEDBACK_SOURCES = ["plan_approval_feedback", "workflow_refine_feedback"] as const;

export function isToolHandlerFailure(value: unknown): value is ToolHandlerFailure {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = value as Partial<ToolHandlerFailure>;
  return (
    fields.result === false &&
    typeof fields.errorCode === "number" &&
    Number.isFinite(fields.errorCode) &&
    typeof fields.message === "string"
  );
}
function handlerFailure(error: unknown): ToolHandlerFailure | undefined {
  if (!isCoreError(error)) return undefined;
  return isToolHandlerFailure(error.context?.toolHandlerFailure)
    ? (error.context!.toolHandlerFailure as ToolHandlerFailure)
    : undefined;
}
export function isToolHandlerFailureError(error: unknown): boolean {
  // 判定不需要取回 payload；复用提取器会额外读取 getter，令原本合法的错误抛出。
  return isCoreError(error) && isToolHandlerFailure(error.context?.toolHandlerFailure);
}

function reasonSource(error: Error): (typeof FEEDBACK_SOURCES)[number] | undefined {
  if (!isCoreError(error)) return undefined;
  // 逐个短路比较后再取值；提前捕获一次可能把有效的动态反馈来源改成普通摘要。
  for (const candidate of FEEDBACK_SOURCES)
    if (error.context?.reasonSource === candidate)
      return error.context!.reasonSource as (typeof FEEDBACK_SOURCES)[number];
  return undefined;
}

function present(error: Error, options?: Presentation) {
  const failure = handlerFailure(error);
  const modelContent =
    getInitialInputValidationModelContent(error) ??
    (failure ? `<tool_use_error>${failure.message}</tool_use_error>` : undefined);
  const projected = projectExecutionErrorPayload(error);
  const source = reasonSource(error);
  // 用户反馈会重新进入任务输入；只在这些明确路径保留原文，不能被展示摘要截断。
  const original = source !== undefined || options?.preserveReasonFormatting === true;
  const message = original ? error.message : projected.message;
  return { failure, modelContent, projected, source, message };
}

export function createErrorResult(
  toolCall: ExecutableToolCall,
  error: Error,
  durationMs?: number,
  options?: Presentation,
): ToolExecutionResult {
  const { failure, modelContent, projected, source, message } = present(error, options);
  return {
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    success: false,
    output: null,
    // 反馈先捕获，元数据后读取；嵌套错误也应在外层调用身份之后构造。
    error: {
      type: isCoreError(error) ? error.type : error.name,
      message,
      ...(failure
        ? { code: String(failure.errorCode) }
        : projected.code
          ? { code: projected.code }
          : {}),
      ...(projected.detail ? { detail: projected.detail } : {}),
      ...(source ? { reasonSource: source } : {}),
      stack: error.stack,
    },
    ...(modelContent === undefined ? {} : { modelContent }),
    durationMs: durationMs ?? 0,
    startedAt: new Date(),
    completedAt: new Date(),
  };
}

export function createToolHandlerFailureError(
  toolCall: ExecutableToolCall,
  failure: ToolHandlerFailure,
): Error {
  return createCoreError(CoreErrorType.ToolExecutionFailed, failure.message, {
    context: {
      code: failure.errorCode,
      toolHandlerFailure: failure,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
    },
    recoverable: true,
  });
}

export function createPermissionErrorResult(
  toolCall: ExecutableToolCall,
  reason: string | undefined,
  context: Record<string, unknown>,
  options?: Presentation,
): ToolExecutionResult {
  const error = createCoreError(
    CoreErrorType.PermissionDenied,
    reason ?? `Permission denied for ${toolCall.name}`,
    {
      context: { ...context, toolName: toolCall.name },
      recoverable: true,
    },
  );
  return createErrorResult(toolCall, error, undefined, options);
}
