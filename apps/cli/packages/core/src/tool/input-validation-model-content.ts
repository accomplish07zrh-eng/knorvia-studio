// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { RuntimeInputValidationIssue } from "./input-normalization.js";
import type { ToolInputValidationIssue } from "./tool-input-validation-issues.js";
import type { ToolEntry } from "./types.js";
import { projectIssues } from "./validation-display/projection.js";
import { issueText } from "./validation-display/text.js";

export function createInitialInputValidationModelContent(
  entry: ToolEntry,
  jsonIssues: readonly ToolInputValidationIssue[],
  runtimeIssues: readonly RuntimeInputValidationIssue[] | undefined,
): string {
  const visible = projectIssues(entry.inputSchema, jsonIssues, runtimeIssues);
  const content = issueText(entry.metadata.name, visible);
  return `<tool_use_error>InputValidationError: ${content}</tool_use_error>`;
}
