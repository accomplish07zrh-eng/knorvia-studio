// SPDX-License-Identifier: Apache-2.0
// run lineage 字段的读法：主归约从进度载荷上搬运 resumedFrom / supersededBy 与停止原因时用的
// 两个窄读器。单独成文件，避免把主归约文件撑过行数门。两者的共同约定：载荷是别人发来的，可能
// 是旧 CLI 的退化形态或损坏数据，因此读不出一律按缺席返回，绝不让整帧被丢——缺一个键是退化，
// 不是错误。停止原因的白名单来自 workflow-observation-display 的词表，避免两处漂移。
import { WORKFLOW_RUN_STOP_REASONS } from "./workflow-observation-display.js";
import type { WorkflowRunState } from "./workflow-runs.js";

// 载荷上的 run id 字段：只有非空字符串才算在场。
export function readRunIdField(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return raw.length > 0 ? raw : undefined;
}

// 载荷上的停止原因：白名单之外（老 CLI 不认识的新词、或损坏载荷）读作缺席。
export function readWorkflowRunStopReason(raw: unknown): WorkflowRunState["stopReason"] {
  if (typeof raw !== "string") return undefined;
  const accepted = WORKFLOW_RUN_STOP_REASONS as readonly string[];
  return accepted.includes(raw) ? (raw as WorkflowRunState["stopReason"]) : undefined;
}
