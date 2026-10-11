// SPDX-License-Identifier: Apache-2.0
// Workspace Hook 的受限遥测：只发稳定 reason、摘要和短消息，绝不带命令、路径或 Trust payload。
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
  /** 领域错误的短消息；不得放命令正文、脚本内容或 workspace 路径。 */
  errorMessage?: string;
  requestItemCount?: number;
  requestEnabledCount?: number;
  grantedRecordCount?: number;
  revokedCount?: number;
}

const ERROR_MESSAGE_LIMIT = 300;
const DIGEST_SUMMARY_LENGTH = 12;
const TELEMETRY_MESSAGE = "Workspace Hook Trust telemetry";
const TELEMETRY_MODULE = "workspace_hook_trust";

/** 摘要只保留前 12 个字符：足够关联同一次评估，不足以还原原文。 */
export function digestSummary(value: string): string {
  return value.length <= DIGEST_SUMMARY_LENGTH ? value : value.slice(0, DIGEST_SUMMARY_LENGTH);
}

/** workspace identity 可能是绝对路径，进入日志前统一取 SHA-256 前 12 位。 */
export function workspaceIdentitySummary(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, DIGEST_SUMMARY_LENGTH);
}

function optionalFields(fields: WorkspaceHookTelemetryFields): Record<string, unknown> {
  return {
    ...(fields.workspaceIdentity
      ? { workspaceIdentityDigest: workspaceIdentitySummary(fields.workspaceIdentity) }
      : {}),
    ...(fields.bundleDigest ? { bundleDigest: digestSummary(fields.bundleDigest) } : {}),
    ...(fields.declarationDigest ? { declarationDigest: digestSummary(fields.declarationDigest) } : {}),
    ...(fields.reasonCode ? { reasonCode: fields.reasonCode } : {}),
    ...(fields.source ? { source: fields.source } : {}),
    ...(fields.action ? { action: fields.action } : {}),
    ...(fields.generation === undefined ? {} : { generation: fields.generation }),
    ...(fields.errorMessage
      ? { errorMessage: fields.errorMessage.slice(0, ERROR_MESSAGE_LIMIT) }
      : {}),
    ...(fields.requestItemCount === undefined ? {} : { requestItemCount: fields.requestItemCount }),
    ...(fields.requestEnabledCount === undefined
      ? {}
      : { requestEnabledCount: fields.requestEnabledCount }),
    ...(fields.grantedRecordCount === undefined
      ? {}
      : { grantedRecordCount: fields.grantedRecordCount }),
    ...(fields.revokedCount === undefined ? {} : { revokedCount: fields.revokedCount }),
  };
}

/** 统一出口：没有 logger 时静默返回，调用方不需要每个事件点重复判空。 */
export function emitWorkspaceHookTelemetry(
  logger: Logger | undefined,
  event: WorkspaceHookTelemetryEvent,
  fields: WorkspaceHookTelemetryFields = {},
): void {
  if (!logger) return;
  logger.info(TELEMETRY_MESSAGE, {
    event,
    module: TELEMETRY_MODULE,
    ...optionalFields(fields),
  });
}
