// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { HookPermissionDecision } from "@knorvia/contracts";
import type { HookRunResult } from "./types.js";

const STRENGTH: Record<HookPermissionDecision, number> = { allow: 1, ask: 2, deny: 3 };
const FIELD_RULES = [
  { kind: "append", field: "additionalContexts" },
  { kind: "sticky", field: "blockRequested", reason: "retain" },
  { kind: "sticky", field: "preventContinuation", reason: "replace" },
  { kind: "present", field: "stopShouldContinue", reason: "retain" },
  { kind: "present", field: "updatedInput" },
] as const;

function copyPresent<K extends "stopShouldContinue" | "updatedInput">(
  target: HookRunResult,
  next: HookRunResult,
  field: K,
): boolean {
  if (next[field] === undefined) return false;
  target[field] = next[field];
  return true;
}

function permissionPair(target: HookRunResult, next: HookRunResult): void {
  // 保留 reason 回调先于行为选择的时点；探测和值读取仍分开，空串是显式理由。
  const reasonProbe = next.hookPermissionDecisionReason;
  const specificReason = reasonProbe ? next.hookPermissionDecisionReason : reasonProbe;
  if (!next.permissionBehavior) {
    // 保留直接 helper 调用的无行为字段合同；正常 JSON 不生成孤立的 specific 理由。
    if (reasonProbe) target.hookPermissionDecisionReason = specificReason;
    return;
  }
  const previous = target.permissionBehavior;
  const incoming = next.permissionBehavior;
  if (!incoming) {
    if (reasonProbe) target.hookPermissionDecisionReason = specificReason;
    target.permissionBehavior = previous === "deny" || previous === "ask" ? previous : incoming;
    return;
  }
  const delta = STRENGTH[incoming] - (previous ? STRENGTH[previous] : 0);
  if (delta < 0) return;
  const reason =
    specificReason ??
    (incoming === "deny" && next.preventContinuation ? next.stopReason : undefined);
  // 理由与获胜行为一起选择：升级不能携带旧弱理由，同级缺席则保留同级说明。
  if (reason !== undefined || reasonProbe || (delta > 0 && previous !== undefined))
    target.hookPermissionDecisionReason = reason;
  target.permissionBehavior = incoming;
}

export function mergeHookRunResult(target: HookRunResult, next: HookRunResult): void {
  for (const rule of FIELD_RULES) {
    if (rule.kind === "append") {
      target.additionalContexts.push(...next.additionalContexts);
      continue;
    }
    if (rule.kind === "sticky") {
      if (!next[rule.field]) continue;
      target[rule.field] = true;
    } else if (!copyPresent(target, next, rule.field)) continue;
    if ("reason" in rule)
      target.stopReason =
        rule.reason === "replace" ? next.stopReason : (next.stopReason ?? target.stopReason);
  }
  if (next.permissionRequestResult) {
    const decision = next.permissionRequestResult;
    if (target.permissionRequestResult?.behavior !== "deny" || decision?.behavior === "deny") {
      // 多条 Hook 仍全部执行，但后续 allow/modify 不能撤销此前结构化拒绝。
      target.permissionRequestResult = decision;
    }
  }
  permissionPair(target, next);
}
