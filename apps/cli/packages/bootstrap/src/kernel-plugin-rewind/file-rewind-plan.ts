// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：文件回退计划（纯计算，不写盘）。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,interface}.md B2、§三
//
// 计划是「把工作区从当前状态改回检查点记录的状态」所需的操作清单：
//   · 检查点有、当前无      → write（恢复内容）
//   · 检查点有、当前内容不同 → write（覆盖）
//   · 检查点无、当前有      → remove（回退 = 删掉检查点之后新增的）
//   · 检查点无、当前无      → 无操作
//   · 检查点有、当前内容相同 → 无操作（已处于目标状态）
//
// **preview 只读**（L2）：只用 `stat` / `readTextFile`，绝不写。
// **每个操作带 expectedHash**（K7）：apply 前用它做漂移检测。

import type { FileSystemPort } from "@knorvia/contracts";
import { readFileState, type FileReadFailure } from "./file-state.js";

/** 一条回退操作。 */
export interface RewindOperation {
  /** 相对 `workspaceRoot` 的路径（POSIX 风格分隔符，跨平台一致）。 */
  readonly path: string;
  readonly action: "write" | "remove";
  /** `action: "write"` 时的目标内容（来自检查点记录）。 */
  readonly content?: string;
  /**
   * 计算该操作时看到的当前内容 hash（K7 漂移检测用）。
   *
   * `ABSENT_HASH`（`"missing"`）表示「计算时文件不存在」。
   */
  readonly expectedHash: string;
  /** 为什么要做这一步（日志/UI 展示；不含文件内容）。 */
  readonly reason: string;
}

/** 检查点里记录的一个文件。 */
export interface CheckpointFileEntry {
  readonly path: string;
  /** 检查点记录的内容；`null` 表示该文件在检查点时不存在。 */
  readonly content: string | null;
}

/** 计划结果。 */
export interface RewindPlan {
  readonly scope: "workspace";
  readonly available: boolean;
  readonly checkpointId?: string;
  readonly operations: readonly RewindOperation[];
  readonly unavailableReason?: string;
}

/** 构造一个「不可用」的计划（目标检查点不存在等）。 */
export function unavailablePlan(reason: string): RewindPlan {
  return { scope: "workspace", available: false, operations: [], unavailableReason: reason };
}

/**
 * 由「检查点记录的文件」与「当前文件状态」算出计划。
 *
 * 这是纯函数：给定同样的输入必然得到同样的计划（便于单测）。
 *
 * @param checkpointId 检查点标识（写进结果，供 apply 与事件使用）
 * @param entries 检查点记录的文件清单
 * @param readCurrent 读当前状态的注入函数（测试可传内存替身）
 */
export async function planFileRewind(
  checkpointId: string,
  entries: readonly CheckpointFileEntry[],
  readCurrent: (
    path: string,
  ) => Promise<
    { ok: true; content: string | null; hash: string } | { ok: false; failure: FileReadFailure }
  >,
): Promise<RewindPlan> {
  const operations: RewindOperation[] = [];

  for (const entry of entries) {
    const current = await readCurrent(entry.path);
    // 读不到当前状态 → 不猜（B9）。整个计划标记为不可用，而不是跳过该文件。
    if (!current.ok) {
      return unavailablePlan(
        `cannot read current state of ${entry.path}: ${current.failure.message}`,
      );
    }

    if (entry.content === null) {
      // 检查点时该文件不存在；若现在存在 → 回退要删掉它。
      if (current.content !== null) {
        operations.push({
          path: entry.path,
          action: "remove",
          expectedHash: current.hash,
          reason: "file did not exist at the checkpoint",
        });
      }
      continue;
    }

    // 检查点时该文件有内容。
    if (current.content === entry.content) continue; // 已处于目标状态 → 无操作
    operations.push({
      path: entry.path,
      action: "write",
      content: entry.content,
      expectedHash: current.hash,
      reason:
        current.content === null
          ? "file was deleted after the checkpoint"
          : "file content differs from the checkpoint",
    });
  }

  return { scope: "workspace", available: true, checkpointId, operations };
}

/**
 * 便捷封装：用 `FileSystemPort` 读当前状态后算计划。
 *
 * `resolvePath` 把「相对 workspaceRoot 的路径」转成端口要求的绝对路径 ——
 * 由调用方注入，本模块不拼路径（L10）。
 */
export async function planFileRewindWithPort(
  fileSystem: FileSystemPort,
  checkpointId: string,
  entries: readonly CheckpointFileEntry[],
  resolvePath: (relativePath: string) => string,
): Promise<RewindPlan> {
  return planFileRewind(checkpointId, entries, async (relativePath) => {
    const result = await readFileState(fileSystem, resolvePath(relativePath));
    if (!result.ok) return { ok: false, failure: result.failure };
    return { ok: true, content: result.state.content, hash: result.state.hash };
  });
}
