// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  modelMessageContentToText,
  type ModelMessageContent,
  type ModelMessageContentBlock,
  type ToolResultBudget,
} from "@knorvia/contracts";
import type { ToolEntry } from "../../types.js";
const DEFAULT_LIMIT = 100_000;
export const DEFAULT_BUDGET: ToolResultBudget = {
  maxInlineBytes: DEFAULT_LIMIT,
  maxModelBytes: DEFAULT_LIMIT,
  strategy: "truncate",
  preview: { direction: "head" },
};
export const modelText = (content: ModelMessageContent): string =>
  typeof content === "string" ? content : modelMessageContentToText(content);
export const byteSize = (text: string): number => Buffer.byteLength(text, "utf8");
export const textLimit = (budget: ToolResultBudget): number =>
  Math.max(0, Math.min(budget.maxModelBytes, budget.maxInlineBytes));
export function formatOutput(output: unknown, entry: ToolEntry): ModelMessageContent {
  if (entry.formatModelContent) return entry.formatModelContent(output);
  switch (typeof output) {
    case "string":
      return output;
    case "undefined":
      return "";
    default:
      try {
        return JSON.stringify(output) ?? "";
      } catch {
        return String(output);
      }
  }
}
export function emptyContent(content: ModelMessageContent): boolean {
  if (typeof content === "string") return !content.trim();
  // Array.every 的既有语义跳过空槽，显式遍历也不能把空槽当成 undefined 块。
  for (let index = 0; index < content.length; index++) {
    if (!(index in content)) continue;
    const block = content[index];
    if (block.type !== "text" || (typeof block.text === "string" && block.text.trim()))
      return false;
  }
  return true;
}
export function hasImage(content: ModelMessageContent): content is ModelMessageContentBlock[] {
  return Array.isArray(content) && content.some((block) => block.type === "image");
}
export function mediaBytes(content: ModelMessageContent): number {
  let bytes = 0;
  if (typeof content !== "string")
    for (let index = 0; index < content.length; index++) {
      if (!(index in content)) continue;
      const block = content[index];
      if (block.type === "image") bytes += byteSize(block.dataUrl);
      else if (block.type === "file" && block.dataUrl !== undefined && block.text === undefined)
        bytes += byteSize(block.dataUrl);
    }
  return bytes;
}
const PATH_FIELDS = ["persistedOutputPath", "rawOutputPath", "artifactPath", "outputPath"] as const;
export function outputPath(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const fields = output as Record<string, unknown>;
  for (const key of PATH_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}
