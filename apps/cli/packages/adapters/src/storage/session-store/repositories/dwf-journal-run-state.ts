// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

export function encodeRunSettlement(
  status: RunStatus,
  settlement?: Pick<RunSettlementRecord, "stopReason" | "supersededBy" | "failure">,
): { status: DwfRunPhysicalStatus; failureJson: string | null } {
  if (status === "pending" || status === "running") {
    return { status, failureJson: null };
  }
  if (status === "stopped") {
    const envelope: StopEnvelope = { stopReason: settlement?.stopReason ?? "user" };
    if (settlement?.supersededBy !== undefined) envelope.supersededBy = settlement.supersededBy;
    if (settlement?.failure !== undefined) envelope.error = settlement.failure;
    return { status: "cancelled", failureJson: encodeJson(envelope) };
  }
  return {
    status: status === "errored" ? "failed" : status,
    failureJson: encodeJson(settlement?.failure),
  };
}

export function encodeRunStatusPredicate(statuses: readonly RunStatus[]): {
  sql: string;
  params: string[];
} {
  const branches: string[] = [];
  const params: string[] = [];
  for (const status of statuses) {
    if (status === "stopped") {
      branches.push(
        "(status = 'cancelled' OR (status = 'failed' AND json_extract(failure_json, '$.code') = ?))",
      );
      params.push("Interrupted");
    } else if (status === "errored") {
      branches.push(
        "(status = 'failed' AND COALESCE(json_extract(failure_json, '$.code'), '') <> ?)",
      );
      params.push("Interrupted");
    } else {
      branches.push("status = ?");
      params.push(status);
    }
  }
  return { sql: branches.length ? `(${branches.join(" OR ")})` : "0", params };
}

export function decodeRunState(row: DwfRunMetadataRow): RunState {
  const failure = decodeJson<WorkflowErrorJson & StopEnvelope>(row.failure_json);
  if (row.status === "cancelled") {
    // 保留历史文本 null 的属性访问异常；本批只替换表达，不修复此兼容边界。
    const envelope: StopEnvelope = failure === undefined ? {} : failure;
    // 非法或缺失停止原因意味着整个信封未识别，不能继续采纳其替代运行或错误。
    if (!stopReasons.includes(envelope.stopReason as RunStopReason)) {
      return { status: "stopped", stopReason: "user" };
    }
    const state: RunState = {
      status: "stopped",
      stopReason: envelope.stopReason as RunStopReason,
    };
    if (typeof envelope.supersededBy === "string" && envelope.supersededBy.length > 0) {
      state.supersededBy = envelope.supersededBy;
    }
    if (envelope.error !== undefined) state.failure = envelope.error;
    return state;
  }
  if (row.status === "failed") {
    const state: RunState =
      failure?.code === "Interrupted"
        ? { status: "stopped", stopReason: "interrupted" }
        : { status: "errored" };
    if (failure !== undefined) state.failure = failure;
    return state;
  }
  const state: RunState = { status: row.status };
  if (row.status === "completed" && failure !== undefined) state.failure = failure;
  return state;
}
