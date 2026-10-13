// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// dwf journal 的行形状：列名即数据库列名，属数据格式，逐字保留；由 dwf-journal-codecs.ts 再导出。
// 形状说明：
// 一、`*_json` 列一律存 JSON 文本，解码时用 decodeJson 容错；列本身允许 NULL。
// 二、物理状态只有五种（pending/running/completed/failed/cancelled），
//     契约状态额外有 stopped/errored，映射规则在 dwf-journal-run-state.ts。
// 三、DwfRunMetadataRow 是「不含 result_json」的运行行，供列表与元数据读取复用。
// 四、DwfWorldNodeRow 在 NodeRecord 之上补运行时间戳与结果体积统计字段。
// 五、时间戳列统一为毫秒整数（time_created/time_updated）。

import type { NodeKind, NodeRecord, NodeRecordStatus, RunRecord } from "@knorvia/dynamic-workflow";

export type DwfRunPhysicalStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export interface DwfRunRow {
  args_json: string | null;
  caps_max_concurrency: number;
  cwd: string | null;
  failure_json: string | null;
  id: string;
  name: string | null;
  parent_session_id: string | null;
  result_json: string | null;
  resumed_from: string | null;
  script_hash: string | null;
  script_text: string | null;
  spent_tokens: number;
  status: DwfRunPhysicalStatus;
  time_created: number;
  time_updated: number;
  tool_call_id: string | null;
}
export type DwfRunMetadataRow = Omit<DwfRunRow, "result_json">;
export interface DwfRunTimestamps {
  timeCreated: number;
  timeUpdated: number;
}
export type DwfRunListItem = Omit<RunRecord, "failure" | "result"> & DwfRunTimestamps;
export type DwfRunDetailRow = RunRecord & DwfRunTimestamps;
export type DwfRunSessionRow = DwfRunMetadataRow;
export type DwfRunSessionListItem = DwfRunListItem & Pick<RunRecord, "failure">;

export interface DwfActorRow {
  id: number;
  name: string | null;
  ordinal: number;
  persona_json: string | null;
  resolved_model: string | null;
  run_id: string;
  session_id: string | null;
  site_id: string;
  time_created: number;
  time_updated: number;
}
export interface DwfNodeRow {
  actor_ordinal: number | null;
  actor_seq: number | null;
  actor_site_id: string | null;
  artifact_id: string | null;
  error_json: string | null;
  id: number;
  input_hash: string;
  input_json: string | null;
  kind: NodeKind;
  message_boundary: number | null;
  ordinal: number;
  result_json: string | null;
  run_id: string;
  site_id: string;
  stats_json: string | null;
  status: NodeRecordStatus;
  time_created: number;
  time_updated: number;
}
export interface DwfWorldNodeRow extends Omit<NodeRecord, "result">, DwfRunTimestamps {
  resultBytes?: number;
  resultCount?: number;
  exitCode?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
}
export interface DwfEventRow {
  id: number;
  payload_json: string;
  run_id: string;
  sequence: number;
  time_created: number;
  type: string;
}
