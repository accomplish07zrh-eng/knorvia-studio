// SPDX-License-Identifier: Apache-2.0
// 受限遥测：把一次准入/审核事件压成"短摘要 + 稳定 reason"，任何能还原命令、脚本或真实路径的
// 内容都不出现在这里。字段先收集成条目再统一过滤，避免逐字段分支拼接。
import { createHash } from "node:crypto";
import type { Logger, WorkspaceHookReasonCode } from "@knorvia/contracts";

export type WorkspaceHookTelemetryEvent =
  | "workspace_hook.feature_disabled"
  | "workspace_hook.review_request_created"
  | "workspace_hook.trust_selected"
  | "workspace_hook.review_timeout"
  | "workspace_hook.review_superseded"
  | "workspace_hook.snapshot_mismatch"
  | "workspace_hook.policy_blocked"
  | "workspace_hook.trust_store_failure"
  | "workspace_hook.toggle_failure"
  | "workspace_hook.config_rebuild_failure"
  | "workspace_hook.revoked"
  | "workspace_hook.stale_response";

export interface WorkspaceHookTelemetryFields {
  workspaceIdentity?: string;
  bundleDigest?: string;
  declarationDigest?: string;
  reasonCode?: WorkspaceHookReasonCode;
  source?: string;
  action?: string;
  generation?: number;
  /** 领域错误的短消息；禁止放命令正文、脚本内容或 workspace 路径。 */
  errorMessage?: string;
  requestItemCount?: number;
  requestEnabledCount?: number;
  grantedRecordCount?: number;
  revokedCount?: number;
}

const SHORT_ID_LENGTH = 12;
const TEXT_BUDGET = 300;
const LOG_TEXT = "Workspace Hook Trust telemetry";
const LOG_MODULE = "workspace_hook_trust";

/** 只保留前 12 个字符：够关联同一次评估，不足以还原原始摘要。 */
export function digestSummary(value: string): string {
  const head = value.substring(0, SHORT_ID_LENGTH);
  return head.length === value.length ? value : head;
}

/** workspace identity 可能是绝对路径，先哈希再取前缀。 */
export function workspaceIdentitySummary(value: string): string {
  const digest = createHash("sha256");
  return digest.update(value).digest("hex").substring(0, SHORT_ID_LENGTH);
}

/**
 * 字段清单：`[输出键, 取值函数]`。取值为 undefined 的条目整体丢弃，
 * 因此这里不需要每个字段各写一次条件展开。
 */
function fieldPlan(fields: WorkspaceHookTelemetryFields): readonly [string, unknown][] {
  return [
    ["workspaceIdentityDigest", fields.workspaceIdentity ? workspaceIdentitySummary(fields.workspaceIdentity) : undefined],
    ["bundleDigest", fields.bundleDigest ? digestSummary(fields.bundleDigest) : undefined],
    ["declarationDigest", fields.declarationDigest ? digestSummary(fields.declarationDigest) : undefined],
    ["reasonCode", fields.reasonCode],
    ["source", fields.source],
    ["action", fields.action],
    ["generation", fields.generation],
    ["errorMessage", fields.errorMessage ? fields.errorMessage.slice(0, TEXT_BUDGET) : undefined],
    ["requestItemCount", fields.requestItemCount],
    ["requestEnabledCount", fields.requestEnabledCount],
    ["grantedRecordCount", fields.grantedRecordCount],
    ["revokedCount", fields.revokedCount],
  ];
}

/** 单一出口：没有 logger 时静默返回，调用点不需要各自判空。 */
function publishTelemetry(
  sink: Logger | undefined,
  marker: WorkspaceHookTelemetryEvent,
  detail: WorkspaceHookTelemetryFields,
): void {
  if (sink === undefined) return;
  const present = fieldPlan(detail).filter(([, value]) => value !== undefined);
  const envelope = [["event", marker], ["module", LOG_MODULE], ...present];
  sink.info(LOG_TEXT, Object.fromEntries(envelope));
}

export function emitWorkspaceHookTelemetry(
  target: Logger | undefined,
  marker: WorkspaceHookTelemetryEvent,
  detail: WorkspaceHookTelemetryFields = {},
): void {
  publishTelemetry(target, marker, detail);
}
