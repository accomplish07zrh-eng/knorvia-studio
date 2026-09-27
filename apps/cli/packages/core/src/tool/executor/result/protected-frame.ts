// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ModelMessageContentBlock } from "@knorvia/contracts";
import { findOfficialCuaFrameContentPair } from "@knorvia/cua/frame-contract";
import { takeBytes, type Direction } from "./byte-budget.js";
import { byteSize, modelText } from "./model-content.js";
const FRAME_CODE = "official_cua_frame_pair_not_leading";
const MARKER =
  "[Official CUA text truncated by resultBudget. Re-observe with detail=compact or a narrower window before relying on omitted state.]";
const SEPARATOR = "\n\n";
export class OfficialCuaFrameContractError extends Error {
  readonly code = FRAME_CODE;
  constructor() {
    super("Official CUA frame pair must be the first two result blocks");
    this.name = "OfficialCuaFrameContractError";
  }
}
export function projectOfficialCuaStructuredContent(
  content: ModelMessageContentBlock[],
  maxModelBytes: number,
  direction: Direction,
): { content: ModelMessageContentBlock[]; truncated: boolean } | undefined {
  const pair = findOfficialCuaFrameContentPair(content);
  if (!pair) return undefined;
  // 只接受 producer 已签发且位于首部的帧，consumer 不提升任何正文为 authority。
  if (pair.imageIndex !== 0 || pair.imageRefIndex !== 1) throw new OfficialCuaFrameContractError();
  const atomic: ModelMessageContentBlock[] = [pair.image, pair.imageRef];
  const text: Array<Extract<ModelMessageContentBlock, { type: "text" }>> = [];
  let dropped = false;
  for (let index = 2; index < content.length; index++) {
    if (!(index in content)) continue;
    const block = content[index];
    if (block.type !== "text") dropped = true;
    else if (block.text.length > 0) text.push(block);
  }
  const complete = atomic.concat(text);
  if (!dropped && byteSize(modelText(complete)) <= maxModelBytes)
    return { content: complete, truncated: false };
  const spare = Math.max(0, maxModelBytes - byteSize(modelText(atomic)));
  const marker = takeBytes(MARKER, Math.max(0, spare - SEPARATOR.length), "head");
  const textQuota = marker ? Math.max(0, spare - byteSize(marker) - 2 * SEPARATOR.length) : 0;
  const excerpt = takeBytes(text.map((block) => block.text).join(SEPARATOR), textQuota, direction);
  if (excerpt) atomic.push({ type: "text", text: excerpt });
  if (marker) atomic.push({ type: "text", text: marker });
  return { content: atomic, truncated: true };
}
