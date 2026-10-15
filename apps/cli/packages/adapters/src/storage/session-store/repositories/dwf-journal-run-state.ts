// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 运行状态编解码：物理列（status / failure_json）与契约状态之间的双向映射。
// SQL 片段、状态字面量与停止原因集合都是数据格式的一部分，逐字保留。

import type {
  RunRecord,
  RunSettlementRecord,
  RunStatus,
  RunStopReason,
  WorkflowErrorJson,
} from "@knorvia/dynamic-workflow";
import { decodeJson, encodeJson } from "../json.js";
import type { DwfRunPhysicalStatus, DwfRunMetadataRow } from "./dwf-journal-codecs.js";

type StopEnvelope = {
  stopReason?: RunStopReason;
  supersededBy?: string;
  error?: WorkflowErrorJson;
};
type RunState = Pick<RunRecord, "status" | "stopReason" | "supersededBy" | "failure">;

const stopReasons: readonly RunStopReason[] = [
  "user",
  "model",
  "provider",
  "interrupted",
  "superseded",
];

const INTERRUPTED_CODE = "Interrupted";
const CANCELLED_BRANCH =
  "(status = 'cancelled' OR (status = 'failed' AND json_extract(failure_json, '$.code') = ?))";
const ERRORED_BRANCH =
  "(status = 'failed' AND COALESCE(json_extract(failure_json, '$.code'), '') <> ?)";
const ACTIVE_BRANCH = "status = ?";
const NEVER_MATCHES = "0";
// 说明（三层语义）：
// 一、物理列只有 pending/running/completed/cancelled/failed 五种；契约状态多了 stopped 与 errored，
//     所以 stopped 必须落成 cancelled，并在 failure_json 里保留停止原因，读回时再还原。
// 二、failed 行要按 failure_json.code 区分：Interrupted 记为 stopped/interrupted，其余才是 errored。
// 三、状态谓词的空输入用 "0"（恒假）表达，而不是省掉 WHERE：调用方可以不判空直接拼接 SQL。

interface Settlement {
  failureJson: string | null;
  status: DwfRunPhysicalStatus;
}

/** 已结束状态 → 物理列：stopped 折成 cancelled 并把停止信息写进信封。 */
function settledStatus(
  status: RunStatus,
  settled?: Pick<RunSettlementRecord, "stopReason" | "supersededBy" | "failure">,
): Settlement {
  const stop: StopEnvelope = { stopReason: settled?.stopReason ?? "user" };
  if (settled?.supersededBy !== undefined) stop.supersededBy = settled.supersededBy;
  if (settled?.failure !== undefined) stop.error = settled.failure;
  return { status: "cancelled", failureJson: encodeJson(stop) };
}

export function encodeRunSettlement(
  status: RunStatus,
  settlement?: Pick<RunSettlementRecord, "stopReason" | "supersededBy" | "failure">,
): Settlement {
  if (status === "pending" || status === "running") {
    const active: Settlement = { status, failureJson: null };
    return active;
  }
  if (status === "stopped") return settledStatus(status, settlement);
  const done: Settlement = {
    status: status === "errored" ? "failed" : status,
    failureJson: encodeJson(settlement?.failure),
  };
  return done;
}

/** 单个契约状态对应的 WHERE 分支与绑定值。 */
function predicateFor(status: RunStatus): { clause: string; binding: string } {
  if (status === "stopped") return { clause: CANCELLED_BRANCH, binding: INTERRUPTED_CODE };
  if (status === "errored") return { clause: ERRORED_BRANCH, binding: INTERRUPTED_CODE };
  return { clause: ACTIVE_BRANCH, binding: status };
}

export function encodeRunStatusPredicate(wanted: readonly RunStatus[]): {
  sql: string;
  params: string[];
} {
  const clauses: string[] = [];
  const bindings: string[] = [];
  for (const status of wanted) {
    const branch = predicateFor(status);
    clauses.push(branch.clause);
    bindings.push(branch.binding);
  }
  const sql = clauses.length ? `(${clauses.join(" OR ")})` : NEVER_MATCHES;
  return { sql, params: bindings };
}

/** cancelled 行 → stopped 状态：非法停止原因视为整个信封不可信。 */
function stoppedFromEnvelope(failure: (WorkflowErrorJson & StopEnvelope) | undefined): RunState {
  // 保留历史文本 null 的属性访问异常；本批只替换表达，不修复此兼容边界。
  const stop: StopEnvelope = failure === undefined ? {} : failure;
  // 非法或缺失停止原因意味着整个信封未识别，不能继续采纳其替代运行或错误。
  if (!stopReasons.includes(stop.stopReason as RunStopReason)) {
    const fallback: RunState = { status: "stopped", stopReason: "user" };
    return fallback;
  }
  const result: RunState = { status: "stopped", stopReason: stop.stopReason as RunStopReason };
  if (typeof stop.supersededBy === "string" && stop.supersededBy.length > 0) {
    result.supersededBy = stop.supersededBy;
  }
  if (stop.error !== undefined) result.failure = stop.error;
  return result;
}

/** failed 行 → errored 或 stopped（Interrupted 视为被中断而非失败）。 */
function failedFromEnvelope(failure: (WorkflowErrorJson & StopEnvelope) | undefined): RunState {
  const result: RunState =
    failure?.code === INTERRUPTED_CODE
      ? { status: "stopped", stopReason: "interrupted" }
      : { status: "errored" };
  if (failure !== undefined) result.failure = failure;
  return result;
}

export function decodeRunState(record: DwfRunMetadataRow): RunState {
  const failure = decodeJson<WorkflowErrorJson & StopEnvelope>(record.failure_json);
  if (record.status === "cancelled") return stoppedFromEnvelope(failure);
  if (record.status === "failed") return failedFromEnvelope(failure);
  const result: RunState = { status: record.status };
  if (record.status === "completed" && failure !== undefined) result.failure = failure;
  return result;
}
