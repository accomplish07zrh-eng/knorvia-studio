// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// telemetry 脱敏（B15 的 7 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B15。
//
// 职责：把信任判定的事实变成**可安全写日志**的结构。
//
// ⚠️ 为什么必须脱敏：
//   信任判定涉及 workspace 路径、命令、声明摘要 ——
//   这些若原样写日志会泄露「用户在工作区里跑了什么」。
//   所以 B15.5 明确「不得出现命令、脚本内容、source path 或 Trust payload」。
import { createHash } from "node:crypto";

/** 摘要截断长度（B15.3）。 */
const DIGEST_SUMMARY_LENGTH = 12;

/** workspaceIdentity 的 SHA-256 十六进制摘要长度（B15.3 / B15.7）。 */
const IDENTITY_DIGEST_LENGTH = 12;

/** errorMessage 的截断长度（B15.4）。 */
const ERROR_MESSAGE_MAX = 300;

/** 固定 module 名（B15.2）。 */
const TELEMETRY_MODULE = "workspace_hook_trust";

/** 日志接口（只取本模块用到的 `info`）。 */
export interface TelemetryLogger {
  info(message: string, meta: Record<string, unknown>): void;
}

/** 可上报的字段（B15.4 的允许清单）。 */
export interface TelemetryFacts {
  readonly event: string;
  readonly workspaceIdentity?: string;
  readonly bundleDigest?: string;
  readonly declarationDigest?: string;
  readonly reasonCode?: string;
  readonly source?: string;
  readonly action?: string;
  readonly generation?: number;
  readonly errorMessage?: string;
  readonly requestItemCount?: number;
  readonly requestEnabledCount?: number;
  readonly grantedRecordCount?: number;
  readonly revokedCount?: number;
}

/**
 * 摘要截断（B15.6）：长度 ≤ 12 原样返回，否则前 12 字符。
 */
export function digestSummary(value: string): string {
  return value.length <= DIGEST_SUMMARY_LENGTH ? value : value.slice(0, DIGEST_SUMMARY_LENGTH);
}

/**
 * workspaceIdentity 摘要（B15.7）：SHA-256 十六进制前 12 位。
 *
 * 用哈希而不是截断 —— 因为 workspace 路径的前 12 字符往往相同（如 `/Users/xxx`），
 * 截断后无法区分不同工作区，而哈希可以。
 */
export function workspaceIdentitySummary(identity: string): string {
  return createHash("sha256")
    .update(identity, "utf8")
    .digest("hex")
    .slice(0, IDENTITY_DIGEST_LENGTH);
}

/** 截断错误消息（B15.4）。 */
function boundErrorMessage(message: string): string {
  return message.length <= ERROR_MESSAGE_MAX ? message : message.slice(0, ERROR_MESSAGE_MAX);
}

/**
 * 上报一条 trust telemetry（B15）。
 *
 * 无 logger → 不做任何事（不抛错，B15.1）。
 * 可选字段**未提供时不出现**（B15.4 末句）。
 */
export function reportTrustTelemetry(
  logger: TelemetryLogger | undefined,
  facts: TelemetryFacts,
): void {
  if (logger === undefined) return;

  const payload: Record<string, unknown> = {
    module: TELEMETRY_MODULE,
    event: facts.event,
  };

  // workspaceIdentity 只以摘要出现（B15.3）。
  if (facts.workspaceIdentity !== undefined) {
    payload.workspaceIdentityDigest = workspaceIdentitySummary(facts.workspaceIdentity);
  }
  // 两个 digest 只取前 12 字符（B15.3）。
  if (facts.bundleDigest !== undefined) payload.bundleDigest = digestSummary(facts.bundleDigest);
  if (facts.declarationDigest !== undefined)
    payload.declarationDigest = digestSummary(facts.declarationDigest);

  // 允许字段（B15.4）—— 逐个判断，未提供的不出现。
  if (facts.reasonCode !== undefined) payload.reasonCode = facts.reasonCode;
  if (facts.source !== undefined) payload.source = facts.source;
  if (facts.action !== undefined) payload.action = facts.action;
  if (facts.generation !== undefined) payload.generation = facts.generation;
  if (facts.errorMessage !== undefined)
    payload.errorMessage = boundErrorMessage(facts.errorMessage);
  if (facts.requestItemCount !== undefined) payload.requestItemCount = facts.requestItemCount;
  if (facts.requestEnabledCount !== undefined)
    payload.requestEnabledCount = facts.requestEnabledCount;
  if (facts.grantedRecordCount !== undefined) payload.grantedRecordCount = facts.grantedRecordCount;
  if (facts.revokedCount !== undefined) payload.revokedCount = facts.revokedCount;

  logger.info("Workspace Hook Trust telemetry", payload);
}
