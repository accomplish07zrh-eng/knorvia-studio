// SPDX-License-Identifier: Apache-2.0
// 初始快照构造：字段表来自 runtime-context-initial-fields.ts，本模块只负责取值与时间戳。
import type { ExpertWorkflowRunSnapshot, WorkflowDefinition } from "@knorvia/contracts";
import {
  initialSnapshotFields,
  type InitialSnapshotInput,
} from "./runtime-context-initial-fields.js";

export type { InitialSnapshotInput };

/** 快照操作所需的最小上下文：定义与统一时钟。 */
export interface SnapshotContext {
  definition: WorkflowDefinition;
  timestamp(): string;
}

/** 初始快照：字段表 + 统一时间戳，运行 id 由调用方生成。 */
export function createInitialSnapshot(
  runtime: SnapshotContext,
  input: InitialSnapshotInput,
  runId: string,
): ExpertWorkflowRunSnapshot {
  const rows = initialSnapshotFields(runtime.definition, input, runId, runtime.timestamp());
  return Object.fromEntries(rows) as unknown as ExpertWorkflowRunSnapshot;
}
