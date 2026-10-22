// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：执行文件回退（含漂移检测与失败补偿）。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,known-differences}.md B3/B6/B10、K6/K7
//
// 执行顺序严格为：**漂移校验 → 记录 journal → 逐步执行 → 写事件**。
//
// **K7 是安全收紧（用户可感知的行为变化）**：
//   旧实现：preview 后用户编辑了文件 → apply 时静默覆盖（编辑丢失）
//   新实现：比对 `expectedHash` → 不一致则拒绝回退，返回「文件已改动，请重新预览」
//   理由：回退是破坏性操作，「拒绝」比「静默覆盖」安全；多一步操作换不丢数据。
//
// **B10 幂等/重入**：
//   · 重复 apply 同一检查点 → 检测到「已处于目标状态」→ applied: 0（不重复写）
//   · 并发 apply 同一检查点 → 第二个返回 in-progress 失败（用 inFlight 集合挡）

import type { FileSystemPort } from "@knorvia/contracts";
import { readFileState, describeError } from "./file-state.js";
import { compensateRewind, type RewindJournalEntry } from "./file-rewind-compensate.js";
import type { RewindOperation } from "./file-rewind-plan.js";

/** 执行结果。 */
export interface RewindApplyResult {
  readonly scope: "workspace";
  readonly rewindId: string;
  /** 成功执行的步数。 */
  readonly applied: number;
  /** 因已是目标状态而跳过的步数。 */
  readonly skipped: number;
  readonly failures: readonly { readonly path: string; readonly reason: string }[];
  /** 是否部分完成（有失败）。 */
  readonly partial: boolean;
  /** `partial` 为真时给出 journal，供人工处理。 */
  readonly journal?: readonly RewindJournalEntry[];
  /** 无法执行时的原因（漂移、并发等）。 */
  readonly unavailableReason?: string;
}

/** 执行依赖。 */
export interface ApplyDependencies {
  readonly fileSystem: FileSystemPort;
  /** 相对路径 → 绝对路径（本模块不拼路径，L10）。 */
  readonly resolvePath: (relativePath: string) => string;
  /** 生成 rewindId（注入便于测试固定值）。 */
  readonly newRewindId: () => string;
}

/** 进行中的回退（B10）。按 checkpointId 记录，避免并发 apply 同一检查点。 */
export type InFlightRegistry = Set<string>;

/** 创建一个空的进行中登记表。 */
export function createInFlightRegistry(): InFlightRegistry {
  return new Set<string>();
}

/**
 * 执行一个文件回退计划。
 *
 * @param checkpointId 目标检查点
 * @param operations 计划里的操作
 * @param deps 依赖（端口、路径解析、id 生成）
 * @param inFlight 进行中登记（B10 并发防护）
 */
export async function applyFileRewind(
  checkpointId: string,
  operations: readonly RewindOperation[],
  deps: ApplyDependencies,
  inFlight: InFlightRegistry,
): Promise<RewindApplyResult> {
  const rewindId = deps.newRewindId();

  // B10：并发 apply 同一检查点 → 第二个直接失败（不进入写入阶段）。
  if (inFlight.has(checkpointId)) {
    return {
      scope: "workspace",
      rewindId,
      applied: 0,
      skipped: 0,
      failures: [],
      partial: false,
      unavailableReason: `rewind for checkpoint ${checkpointId} is already in progress`,
    };
  }

  inFlight.add(checkpointId);
  try {
    return await runApply(checkpointId, rewindId, operations, deps);
  } finally {
    // 无论成功失败都清理（B10 断言 3：finally 里清理）。
    inFlight.delete(checkpointId);
  }
}

/** 实际的执行体（已持有 inFlight 锁）。 */
async function runApply(
  checkpointId: string,
  rewindId: string,
  operations: readonly RewindOperation[],
  deps: ApplyDependencies,
): Promise<RewindApplyResult> {
  const { fileSystem, resolvePath } = deps;

  // ── 第一步：漂移校验（K7/B6）──────────────────────────────────────────────
  // **早于任何写入**。不一致就整体拒绝，不进入 journal 阶段。
  const drift = await detectDrift(fileSystem, operations, resolvePath);
  if (drift.length > 0) {
    return {
      scope: "workspace",
      rewindId,
      applied: 0,
      skipped: 0,
      failures: drift,
      partial: false,
      unavailableReason: `${drift.length} file(s) changed since preview; re-preview before rewinding`,
    };
  }

  // ── 第二步：逐步执行 + 记录 journal ──────────────────────────────────────
  const journal: RewindJournalEntry[] = [];
  let applied = 0;
  let skipped = 0;
  const failures: { path: string; reason: string }[] = [];

  for (const operation of operations) {
    const absolute = resolvePath(operation.path);
    // 记录执行前的状态（补偿用）。
    const before = await readFileState(fileSystem, absolute);
    if (!before.ok) {
      failures.push({ path: operation.path, reason: before.failure.message });
      break;
    }

    // B10 幂等：已经处于目标状态 → 跳过（不写、不记 journal）。
    if (isAlreadyAtTarget(operation, before.state.content)) {
      skipped += 1;
      continue;
    }

    try {
      if (operation.action === "remove") {
        await fileSystem.removeFile({ path: absolute, missingOk: true });
      } else {
        await fileSystem.writeTextFile({
          path: absolute,
          content: operation.content ?? "",
          createParents: true,
        });
      }
      journal.push({ path: operation.path, before: before.state, action: operation.action });
      applied += 1;
    } catch (error) {
      failures.push({ path: operation.path, reason: describeError(error) });
      break;
    }
  }

  // ── 第三步：有失败 → 补偿（K6）───────────────────────────────────────────
  if (failures.length > 0) {
    const compensation = await compensateRewind(fileSystem, journal, resolvePath);
    return {
      scope: "workspace",
      rewindId,
      applied: 0,
      skipped,
      failures,
      partial: true,
      journal,
      unavailableReason: compensation.ok
        ? `rewind failed at ${failures[0].path} and was rolled back; nothing was changed`
        : `rewind failed and compensation also failed (${compensation.failures.length} step(s)); manual review required`,
    };
  }

  // ── 全部成功 ─────────────────────────────────────────────────────────────
  void checkpointId;
  return { scope: "workspace", rewindId, applied, skipped, failures: [], partial: false };
}

/**
 * 漂移检测（K7/B6）：逐条比对 `expectedHash` 与当前 hash。
 *
 * **语义细节**：
 * - 内容变了 → 漂移（拒绝）
 * - 文件被删除但操作是 `write` → **不算漂移**（回退要做的正是恢复，B6 断言 3）
 * - 文件被删除且操作是 `remove` → 已处于目标状态，不算漂移
 */
async function detectDrift(
  fileSystem: FileSystemPort,
  operations: readonly RewindOperation[],
  resolvePath: (relativePath: string) => string,
): Promise<{ path: string; reason: string }[]> {
  const drift: { path: string; reason: string }[] = [];
  for (const operation of operations) {
    const current = await readFileState(fileSystem, resolvePath(operation.path));
    if (!current.ok) {
      drift.push({ path: operation.path, reason: current.failure.message });
      continue;
    }
    // 文件不存在：`write` 是「需恢复」、`remove` 是「已达标」，两者都不算漂移。
    if (current.state.content === null) continue;
    if (current.state.hash !== operation.expectedHash) {
      drift.push({ path: operation.path, reason: "content changed since preview" });
    }
  }
  return drift;
}

/** 判断当前内容是否已是该操作的目标状态（B10 幂等）。 */
function isAlreadyAtTarget(operation: RewindOperation, currentContent: string | null): boolean {
  if (operation.action === "remove") return currentContent === null;
  return currentContent === (operation.content ?? "");
}
