// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：回退失败时的补偿。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,known-differences}.md B4/B5、K6
//
// **K6 是安全相关的有意差异**：
//   旧实现（file-rewind-storage.ts 的 compensate）逐条回滚，遇到失败**继续尝试后续回滚**。
//   新实现**补偿失败即停**，把 journal 交给调用方并报告 partial。
//
// **理由**：补偿本身失败说明文件系统状态异常 → 继续尝试可能让状态更混乱；
// 交给调用方（UI 可展示「部分回退，需要人工检查这些文件」）比静默继续更负责。
//
// **补偿边界（B5）**：只补偿「本次已执行」的步骤（journal 里的条目），
// 不碰计划外的文件 —— 否则可能覆盖用户的并发编辑。

import type { FileSystemPort } from "@knorvia/contracts";
import { describeError, type FileState } from "./file-state.js";

/** journal 的一条：某文件在执行某操作**之前**的状态。 */
export interface RewindJournalEntry {
  /** 相对 `workspaceRoot` 的路径。 */
  readonly path: string;
  /** 执行该步之前的状态（补偿时恢复成它）。 */
  readonly before: FileState;
  readonly action: "write" | "remove";
}

/** 补偿结果。 */
export interface CompensationResult {
  /** 是否全部补偿成功。 */
  readonly ok: boolean;
  /** 补偿了多少步。 */
  readonly compensated: number;
  /** 补偿失败的步骤（`ok: false` 时非空）。 */
  readonly failures: readonly { readonly path: string; readonly reason: string }[];
}

/**
 * 按 journal 的**逆序**补偿已执行的操作。
 *
 * 每步的语义：
 * - `before.content === null`（原本不存在）→ 删掉它（`removeFile` 带 `missingOk`）
 * - 否则 → 写回原内容（`writeTextFile`）
 *
 * **⚠️ 补偿失败即停**（K6）：不在失败后继续尝试剩余步骤。
 *
 * @param fileSystem 文件系统端口
 * @param journal 已执行步骤的记录（按执行顺序）
 * @param resolvePath 相对路径 → 绝对路径
 */
export async function compensateRewind(
  fileSystem: FileSystemPort,
  journal: readonly RewindJournalEntry[],
  resolvePath: (relativePath: string) => string,
): Promise<CompensationResult> {
  const failures: { path: string; reason: string }[] = [];
  let compensated = 0;

  // 逆序：最后执行的先回滚。
  for (let index = journal.length - 1; index >= 0; index -= 1) {
    const entry = journal[index];
    const absolute = resolvePath(entry.path);
    try {
      if (entry.before.content === null) {
        // 原本不存在 → 删掉这次创建的文件。`missingOk` 让「已经不存在」也算成功。
        await fileSystem.removeFile({ path: absolute, missingOk: true });
      } else {
        // 原本有内容 → 写回。`createParents` 处理「父目录被一起回滚」的情形。
        await fileSystem.writeTextFile({
          path: absolute,
          content: entry.before.content,
          createParents: true,
        });
      }
      compensated += 1;
    } catch (error) {
      // **失败即停**（K6）：记录后立刻返回，不再尝试更早的步骤。
      failures.push({ path: entry.path, reason: describeError(error) });
      return { ok: false, compensated, failures };
    }
  }

  return { ok: true, compensated, failures };
}
