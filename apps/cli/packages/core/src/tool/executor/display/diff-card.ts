// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { DiffHunk, ToolResultDisplayPayload } from "@knorvia/contracts";
import { countPatchLines } from "../../diff.js";
import { isRecord } from "../utils.js";

function compatibleHunk(value: unknown): value is DiffHunk {
  if (!isRecord(value)) return false;
  for (const key of ["oldStart", "oldLines", "newStart", "newLines"]) {
    if (typeof value[key] !== "number") return false;
  }
  return Array.isArray(value.lines) && value.lines.every((line) => typeof line === "string");
}

export function createDiffCard(output: unknown): ToolResultDisplayPayload | undefined {
  if (!isRecord(output)) return;
  const { filePath, structuredPatch } = output;
  if (typeof filePath !== "string" || !Array.isArray(structuredPatch)) return;
  const accepted = structuredPatch.filter(compatibleHunk);
  if (!accepted.length) return;
  // 统计属于完整结果；显示窗口的行数限制不能缩小增删总数。
  const counts = countPatchLines(accepted);
  const visible: DiffHunk[] = [];
  let used = 0;
  let truncated = accepted.length > 8;
  for (let index = 0; index < Math.min(8, accepted.length); index++) {
    const item = accepted[index]!;
    if (used === 160) {
      truncated = true;
      break;
    }
    const lines = item.lines.slice(0, 160 - used);
    visible.push({ ...item, lines });
    used += lines.length;
    // 浅复制可触发附加字段读取；原数组缩短不代表显示窗口丢弃了后续 hunk。
    if (lines.length < item.lines.length) {
      truncated = true;
      break;
    }
  }
  return { kind: "file_diff", filePath, ...counts, structuredPatch: visible, truncated };
}
