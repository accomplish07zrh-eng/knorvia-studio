// SPDX-License-Identifier: Apache-2.0
// 受限遥测发射端：把一次准入/审核事件压成"短摘要 + 稳定 reason"，任何能还原命令、脚本或
// 真实路径的内容都不出现在这里。事件名与字段的声明在 types.ts（兼容面），本文件只发射。
import { createHash } from "node:crypto";
import type { Logger } from "@knorvia/contracts";
import type { WorkspaceHookTelemetryEvent, WorkspaceHookTelemetryFields } from "./types.js";

export type { WorkspaceHookTelemetryEvent, WorkspaceHookTelemetryFields } from "./types.js";

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
    [
      "workspaceIdentityDigest",
      fields.workspaceIdentity ? workspaceIdentitySummary(fields.workspaceIdentity) : undefined,
    ],
    ["bundleDigest", fields.bundleDigest ? digestSummary(fields.bundleDigest) : undefined],
    [
      "declarationDigest",
      fields.declarationDigest ? digestSummary(fields.declarationDigest) : undefined,
    ],
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
