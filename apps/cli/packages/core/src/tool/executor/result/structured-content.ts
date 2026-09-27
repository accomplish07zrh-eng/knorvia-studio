// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ModelMessageContent, ModelMessageContentBlock } from "@knorvia/contracts";
import type { ToolResultSerialization } from "../../types.js";
import {
  fitContentWithSuffix,
  takeBytes,
  type Direction,
  type TextProjection,
} from "./byte-budget.js";
import { byteSize } from "./model-content.js";
const SEPARATOR = "\n\n";
export function appendHookWithoutReorderingStructuredContent(
  serialization: ToolResultSerialization,
  hookContext: string,
  suffix: string,
  maxModelBytes: number,
): ToolResultSerialization {
  const blocks = serialization.modelContent ?? serialization.content;
  if (typeof blocks === "string") return serialization;
  const spare = Math.max(0, maxModelBytes - byteSize(serialization.content));
  const addition =
    spare > SEPARATOR.length ? takeBytes(hookContext, spare - SEPARATOR.length, "head") : "";
  const text = addition ? SEPARATOR + addition : "";
  return {
    ...serialization,
    content: serialization.content + text,
    // 不重排既有栅格；新增文本在帧之后，用单一 aggregate 累加实际增量。
    modelContent: addition ? [...blocks, { type: "text", text: addition }] : blocks,
    returnedBytes: serialization.returnedBytes + byteSize(text),
    truncated: serialization.truncated || byteSize(suffix) > spare,
  };
}
function retained(block: ModelMessageContentBlock): boolean {
  return (
    block.type !== "text" &&
    !(block.type === "file" && typeof block.text === "string" && block.text.length > 0)
  );
}
export function projectHookAugmentedModelContent(input: {
  artifactPreview: boolean;
  contentProjection: TextProjection;
  hookContext: string;
  maxModelBytes: number;
  modelContent: ModelMessageContent;
  previewDirection: Direction;
  suffix: string;
}): ModelMessageContent {
  const { modelContent: source, contentProjection: projected } = input;
  if (input.artifactPreview) return projected.content;
  if (!projected.truncated)
    return typeof source === "string"
      ? source + SEPARATOR + input.hookContext
      : [...source, { type: "text", text: input.hookContext }];
  if (typeof source === "string" || !source.some(retained)) return projected.content;
  const text: string[] = [];
  for (let index = 0; index < source.length; index++) {
    if (!(index in source)) continue;
    const block = source[index];
    // text 只采样一次；file 仍先检查再取值，保留公开内容对象的有限 getter 行为。
    const value =
      block.type === "text"
        ? block.text
        : block.type === "file" && typeof block.text === "string"
          ? block.text
          : "";
    if (value.length) text.push(value);
  }
  const budgeted = fitContentWithSuffix(
    text.join(SEPARATOR),
    input.maxModelBytes,
    input.suffix,
    input.previewDirection,
  );
  const media = source.filter(retained);
  if (budgeted) media.push({ type: "text", text: budgeted });
  return media;
}
