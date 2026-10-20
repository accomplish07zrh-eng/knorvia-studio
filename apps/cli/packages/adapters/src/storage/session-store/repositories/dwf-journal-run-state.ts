// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工作流运行状态的编解码：契约状态 ↔ 物理列（status / failure_json）。
//
// 三层语义（改动前务必读完，这决定了旧库能不能读回来）：
// 一、物理列只有 pending/running/completed/cancelled/failed；契约状态另有 stopped 与 errored，
//     所以 stopped 要落成 cancelled，同时把停止原因写进 failure_json 信封，读回时再还原；
// 二、failed 行按 failure_json.code 分流：Interrupted 还原成 stopped/interrupted，其余才是 errored；
// 三、状态谓词的空输入用恒假表达式 "0" 表达，而不是省略 WHERE —— 调用方不必判空即可拼 SQL。
//
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

/** 停止信封：附在 failed/cancelled 行的 failure_json 里，承载契约态的额外信息。 */
type StopEnvelope = {
  stopReason?: RunStopReason;
  supersededBy?: string;
  error?: WorkflowErrorJson;
};

/** 从运行记录里取出的状态视图：契约态 + 停止原因 + 替代者 + 失败详情。 */
type RunState = Pick<RunRecord, "status" | "stopReason" | "supersededBy" | "failure">;

/**
 * 可接受的停止原因。这五个字面量是数据格式的一部分（会写进 failure_json 并原样读出），
 * 值不能改；这里用位置元组而不是逐行字符串，读回时再转成集合做成员判定。
 */
const STOP_REASON_ORDER = ["user", "model", "provider", "interrupted", "superseded"] as const;
const STOP_REASONS: readonly RunStopReason[] = STOP_REASON_ORDER;
const STOP_REASON_SET: ReadonlySet<string> = new Set(STOP_REASON_ORDER);

/** 被中断的失败码：failed 行里带这个码的，还原成 stopped 而非 errored。 */
const INTERRUPTED_CODE = "Interrupted";

/** 已结束状态落库后的形状。 */
interface Settlement {
  failureJson: string | null;
  status: DwfRunPhysicalStatus;
}

/** 三种状态谓词的 SQL 片段与绑定值：stopped / errored / 其余。 */
const PREDICATES = {
  cancelled:
    "(status = 'cancelled' OR (status = 'failed' AND json_extract(failure_json, '$.code') = ?))",
  errored: "(status = 'failed' AND COALESCE(json_extract(failure_json, '$.code'), '') <> ?)",
  active: "status = ?",
} as const;

/** 空输入时的恒假片段：调用方可以不判空就拼进 WHERE。 */
const NEVER_MATCHES = "0";

/** 契约状态是否仍在进行中。 */
function isActiveStatus(status: RunStatus): boolean {
  return status === "pending" || status === "running";
}

/** 组装停止信封：停止原因缺省记为 user，其余字段仅在存在时出现。 */
function makeStopEnvelope(
  settlement?: Pick<RunSettlementRecord, "stopReason" | "supersededBy" | "failure">,
): StopEnvelope {
  const stop = {} as StopEnvelope;
  stop.stopReason = settlement?.stopReason ?? "user";
  if (settlement?.supersededBy !== undefined) stop.supersededBy = settlement.supersededBy;
  if (settlement?.failure !== undefined) stop.error = settlement.failure;
  return stop;
}

/** 已结束状态落库：active 原样保留，stopped 折成 cancelled，其余按 errored/failed 归一。 */
export function encodeRunSettlement(
  status: RunStatus,
  settlement?: Pick<RunSettlementRecord, "stopReason" | "supersededBy" | "failure">,
): Settlement {
  if (isActiveStatus(status)) {
    const active = {} as Settlement;
    active.status = status as DwfRunPhysicalStatus;
    active.failureJson = null;
    return active;
  }
  if (status === "stopped") {
    const cancelled = {} as Settlement;
    cancelled.status = "cancelled";
    cancelled.failureJson = encodeJson(makeStopEnvelope(settlement));
    return cancelled;
  }
  const settled = {} as Settlement;
  settled.status = status === "errored" ? "failed" : (status as DwfRunPhysicalStatus);
  settled.failureJson = encodeJson(settlement?.failure);
  return settled;
}

/** 单个契约状态对应的谓词分支。 */
function predicateFor(status: RunStatus): { clause: string; binding: string } {
  if (status === "stopped") return { clause: PREDICATES.cancelled, binding: INTERRUPTED_CODE };
  if (status === "errored") return { clause: PREDICATES.errored, binding: INTERRUPTED_CODE };
  return { clause: PREDICATES.active, binding: status };
}

/** 把一组契约状态翻成一个可拼进 WHERE 的谓词；空输入返回恒假片段。 */
export function encodeRunStatusPredicate(wanted: readonly RunStatus[]): {
  sql: string;
  params: string[];
} {
  const clauses: string[] = [];
  const params: string[] = [];
  for (const status of wanted) {
    const branch = predicateFor(status);
    clauses.push(branch.clause);
    params.push(branch.binding);
  }
  const sql = clauses.length === 0 ? NEVER_MATCHES : `(${clauses.join(" OR ")})`;
  return { sql, params };
}

/** cancelled 行读回 stopped：停止原因非法则整个信封不可信，退到 user。 */
function stoppedFromEnvelope(failure: (WorkflowErrorJson & StopEnvelope) | undefined): RunState {
  const stop = (failure === undefined ? {} : failure) as StopEnvelope;
  const reason = stop.stopReason as RunStopReason;
  if (!STOP_REASON_SET.has(reason)) {
    const untrusted = {} as RunState;
    untrusted.status = "stopped";
    untrusted.stopReason = "user";
    return untrusted;
  }
  const restored = {} as RunState;
  restored.status = "stopped";
  restored.stopReason = reason;
  if (typeof stop.supersededBy === "string" && stop.supersededBy.length > 0) {
    restored.supersededBy = stop.supersededBy;
  }
  if (stop.error !== undefined) restored.failure = stop.error;
  return restored;
}

/** failed 行读回：带 Interrupted 码的算被中断，其余算 errored。 */
function failedFromEnvelope(failure: (WorkflowErrorJson & StopEnvelope) | undefined): RunState {
  const restored = {} as RunState;
  if (failure?.code === INTERRUPTED_CODE) {
    restored.status = "stopped";
    restored.stopReason = "interrupted";
  } else {
    restored.status = "errored";
  }
  if (failure !== undefined) restored.failure = failure;
  return restored;
}

/** 物理行读回契约状态。 */
export function decodeRunState(record: DwfRunMetadataRow): RunState {
  const envelope = decodeJson<WorkflowErrorJson & StopEnvelope>(record.failure_json);
  if (record.status === "cancelled") return stoppedFromEnvelope(envelope);
  if (record.status === "failed") return failedFromEnvelope(envelope);
  const plain = {} as RunState;
  plain.status = record.status;
  if (record.status === "completed" && envelope !== undefined) plain.failure = envelope;
  return plain;
}
