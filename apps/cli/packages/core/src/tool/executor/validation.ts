// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { CoreErrorType, createCoreError, isCoreError } from "@knorvia/contracts";
import type { RuntimeInputValidationIssue } from "../input-normalization.js";
import type { ToolInputValidationIssue } from "../tool-input-validation-issues.js";
import type { ToolEntry } from "../types.js";
import { runtimeParser } from "../runtime-schema.js";
import { validateJsonSchemaValue } from "../json-schema.js";
import { createInitialInputValidationModelContent } from "../input-validation-model-content.js";

const MODEL_CONTENT = "initialInputValidationModelContent";
const CONTEXT_LIMIT = 20;
const FAILURES = {
  input: { message: "Tool input failed inputSchema validation", recoverable: true },
  output: { message: "Tool output failed outputSchema validation", recoverable: false },
  runtimeOutput: {
    message: "Tool output failed runtimeOutputSchema validation",
    recoverable: false,
  },
};

function failure(
  stage: keyof typeof FAILURES,
  entry: ToolEntry,
  errors: string[],
  modelContent?: string,
): Error {
  const context: Record<string, unknown> = {
    errors: errors.slice(0, CONTEXT_LIMIT),
    toolName: entry.metadata.name,
  };
  if (modelContent !== undefined) context[MODEL_CONTENT] = modelContent;
  const policy = FAILURES[stage];
  return createCoreError(CoreErrorType.ToolExecutionFailed, policy.message, {
    context,
    recoverable: policy.recoverable,
  });
}

function inspectInput(
  input: unknown,
  entry: ToolEntry,
  describe?: (issues: ToolInputValidationIssue[]) => string,
): Error | undefined {
  const validation = validateJsonSchemaValue(input, entry.inputSchema);
  if (validation.valid) return undefined;
  return failure("input", entry, validation.errors, describe?.(validation.issues));
}

export function validateInput(input: unknown, entry: ToolEntry): Error | undefined {
  return inspectInput(input, entry);
}

export function validateInitialModelToolInput(
  input: unknown,
  entry: ToolEntry,
  runtimeValidationIssues?: readonly RuntimeInputValidationIssue[],
): Error | undefined {
  // 首次调用独有的描述回调不进入后续 Hook/permission 校验，避免复用错误阶段的模型内容。
  return inspectInput(input, entry, (issues) =>
    createInitialInputValidationModelContent(entry, issues, runtimeValidationIssues),
  );
}

export function getInitialInputValidationModelContent(error: Error): string | undefined {
  if (!isCoreError(error) || error.type !== CoreErrorType.ToolExecutionFailed) return undefined;
  const value = error.context?.[MODEL_CONTENT];
  return typeof value === "string" ? value : undefined;
}

export function validateOutput(output: unknown, entry: ToolEntry): void {
  const parse = runtimeParser(entry.runtimeOutputSchema, "output");
  if (parse) {
    const result = parse(output);
    if (result.success) return;
    const error = result.error as { issues: Array<{ message: string }> };
    throw failure(
      "runtimeOutput",
      entry,
      error.issues.map((issue) => issue.message),
    );
  }
  const validation = validateJsonSchemaValue(output, entry.outputSchema);
  if (!validation.valid) throw failure("output", entry, validation.errors);
}
