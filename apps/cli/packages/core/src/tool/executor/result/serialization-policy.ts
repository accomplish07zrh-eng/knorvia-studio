// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ModelMessageContent, ToolResultBudget } from "@knorvia/contracts";
import type { ToolEntry, ToolResultSerialization } from "../../types.js";
import {
  byteSize,
  DEFAULT_BUDGET,
  emptyContent,
  formatOutput,
  modelText,
  outputPath,
  textLimit,
} from "./model-content.js";

export interface OutputFacts {
  model: ModelMessageContent;
  text: string;
  bytes: number;
  budget: ToolResultBudget;
}
export interface SizedOutput extends OutputFacts {
  contentType: string;
  overCharacters: boolean;
  limit: number;
  path?: string;
  save: boolean;
}
export function inspectOutput(
  output: unknown,
  entry: ToolEntry,
): { kind: "empty"; facts: OutputFacts } | { kind: "sized"; facts: SizedOutput } {
  const budget = entry.resultBudget ?? DEFAULT_BUDGET;
  const model = formatOutput(output, entry);
  const text = modelText(model);
  if (emptyContent(model))
    return { kind: "empty", facts: { model, text, bytes: byteSize(text), budget } };
  const contentType =
    entry.resultArtifactContentType ??
    (typeof output === "string" ? "text/plain" : "application/json");
  const bytes = byteSize(text);
  const overCharacters = entry.maxModelChars !== undefined && text.length > entry.maxModelChars;
  const limit = textLimit(budget);
  const path = outputPath(output);
  const save =
    (bytes > limit || overCharacters) &&
    budget.artifact?.enabled === true &&
    budget.strategy === "artifact";
  return {
    kind: "sized",
    facts: { model, text, bytes, budget, contentType, overCharacters, limit, path, save },
  };
}
export function outputDecision(
  facts: SizedOutput,
  saved: boolean,
  path: string | undefined,
): "original" | "preview" | "truncate" {
  // 字符合同要求保存失败时保留原始 provider 文本；只超字节时仍受通常配额约束。
  if (
    (facts.bytes <= facts.limit && !facts.overCharacters) ||
    (facts.overCharacters && facts.save && !saved)
  )
    return "original";
  return facts.budget.strategy === "artifact" &&
    facts.budget.artifact?.enabled === true &&
    saved &&
    !!path
    ? "preview"
    : "truncate";
}
export function resultEnvelope(
  facts: OutputFacts,
  modelContent: ModelMessageContent,
  truncated: boolean,
  path: { artifactPath?: string } = {},
  mediaBytes = 0,
  capturedText?: string,
): ToolResultSerialization {
  // 原文分支保留保存前文本快照；模型块仍按契约保留引用，不能在 await 后重新转换。
  const content = capturedText ?? modelText(modelContent);
  return {
    content,
    modelContent,
    originalBytes: facts.bytes,
    returnedBytes: byteSize(content) + mediaBytes,
    truncated,
    budgetStrategy: facts.budget.strategy,
    ...path,
  };
}
