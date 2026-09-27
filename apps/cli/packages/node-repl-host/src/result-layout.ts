// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { isOfficialCuaImageRefText } from "@knorvia/cua/frame-contract";
import type { NodeReplRunResult, NodeReplStructuredResult } from "@knorvia/core/repl";
import type { CallToolResult } from "@modelcontextprotocol/server";

type Content = CallToolResult["content"][number];
export interface ResultLayout {
  content: Content[];
  imagePositions: Map<number, number>;
}

/** Frame pairs are indivisible units; ordinary blocks keep their relative order. */
function currentFrameBlocks(blocks: Content[]): Content[] {
  const units: Array<{ frame: boolean; blocks: Content[] }> = [];
  let newestFrame: number | undefined;
  for (let index = 0; index < blocks.length; ) {
    const first = blocks[index],
      next = blocks[index + 1];
    const frame =
      first.type === "image" && next?.type === "text" && isOfficialCuaImageRefText(next.text);
    if (frame) newestFrame = units.length;
    units.push({ frame, blocks: frame ? [first, next] : [first] });
    index += frame ? 2 : 1;
  }
  return units.flatMap((unit, index) => (unit.frame && index !== newestFrame ? [] : unit.blocks));
}

/** Builds a content tape and a separate map from host image observations to that tape. */
export function layoutResult(
  run: NodeReplRunResult,
  presentations: NodeReplStructuredResult[],
  explicit: boolean,
): ResultLayout {
  const content: Content[] = [];
  const imagePositions = new Map<number, number>();
  if (run.error) return { content: [{ type: "text", text: run.error.message }], imagePositions };

  const blocks = currentFrameBlocks(presentations.flatMap((item) => item.content as Content[]));
  if (explicit) content.push(...blocks);
  for (const [sourceIndex, picture] of (run.images ?? []).entries()) {
    const existing = explicit
      ? content.findIndex(
          (block) =>
            block.type === "image" &&
            block.data === picture.base64 &&
            block.mimeType === picture.mimeType,
        )
      : -1;
    const position = existing >= 0 ? existing : content.length;
    imagePositions.set(sourceIndex, position);
    if (existing < 0)
      content.push({ type: "image", data: picture.base64, mimeType: picture.mimeType });
  }
  if (!explicit) content.push(...blocks);

  const messages = [run.logs];
  if (!presentations.length && run.result !== undefined) messages.push(`=> ${run.result}`);
  const text = messages.filter(Boolean).join("\n");
  if (text) content.push({ type: "text", text });
  if (!content.length) content.push({ type: "text", text: "(no output)" });
  return { content, imagePositions };
}
