// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { RuntimeInputValidationIssue } from "./input-normalization.js";
import type { ToolInputValidationIssue } from "./tool-input-validation-issues.js";
import type { ToolEntry } from "./types.js";
import { projectIssues } from "./validation-display/projection.js";
import { issueText } from "./validation-display/text.js";

/** 一次输入校验的输入面：工具条目 + JSON 层问题 + 运行时层问题。 */
export interface InputValidationSources {
  entry: ToolEntry;
  jsonIssues: readonly ToolInputValidationIssue[];
  runtimeIssues: readonly RuntimeInputValidationIssue[] | undefined;
}

/** 把两种入参形态归一：字段对象直接用，三个位置参数按序装配。 */
const sourcesOf = (
  first: InputValidationSources | ToolEntry,
  jsonIssues: readonly ToolInputValidationIssue[] | undefined,
  runtimeIssues: readonly RuntimeInputValidationIssue[] | undefined,
): InputValidationSources =>
  "entry" in first ? first : { entry: first, jsonIssues: jsonIssues ?? [], runtimeIssues };

/**
 * 渲染首次输入校验的模型可见内容。
 * 推荐传 `{ entry, jsonIssues, runtimeIssues }`；三个位置参数保留以兼容既有调用方。
 */
export const createInitialInputValidationModelContent = (
  first: InputValidationSources | ToolEntry,
  jsonIssues?: readonly ToolInputValidationIssue[],
  runtimeIssues?: readonly RuntimeInputValidationIssue[] | undefined,
): string => {
  const {
    entry,
    jsonIssues: issues,
    runtimeIssues: runtime,
  } = sourcesOf(first, jsonIssues, runtimeIssues);
  const content = issueText(entry.metadata.name, projectIssues(entry.inputSchema, issues, runtime));
  return `<tool_use_error>InputValidationError: ${content}</tool_use_error>`;
};
