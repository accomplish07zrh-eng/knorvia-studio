// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { CollaborationMode, PermissionBrokerResult } from "@knorvia/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { PermissionDecisionResult } from "../../permission/service.js";

const REASONS = {
  deny: "Denied by PermissionRequest hook",
  allow: "Allowed by PermissionRequest hook",
  modify: "Allowed with modified input by PermissionRequest hook",
} as const;

/** Interpret one already-merged result; HookRunner alone arbitrates multiple hooks. */
export function projectPermissionHook(result: HookRunResult): PermissionBrokerResult | undefined {
  const structured = result.permissionRequestResult;
  if (result.preventContinuation)
    return { decision: "deny", reason: result.stopReason ?? REASONS.deny };
  if (!structured) {
    // 兼容结果的两个阶段按顺序读当前值，不能提前快照成一次 switch。
    if (result.permissionBehavior === "deny")
      return { decision: "deny", reason: result.stopReason ?? REASONS.deny };
    return result.permissionBehavior === "allow"
      ? { decision: "allow", reason: REASONS.allow }
      : undefined;
  }
  if (structured.behavior === "deny")
    return { decision: "deny", reason: structured.message ?? REASONS.deny };
  const permissionUpdates = structured.permissionUpdates ?? structured.updatedPermissions;
  const reply =
    structured.updatedInput === undefined
      ? { decision: "allow" as const }
      : { decision: "modify" as const, modifiedInput: structured.updatedInput };
  return { ...reply, permissionUpdates, reason: REASONS[reply.decision] };
}

const PRE_TRANSITIONS = [
  {
    target: "allow",
    reason: "Tool was allowed by PreToolUse hook",
    accepts: (decision: PermissionDecisionResult, hook: HookRunResult) =>
      // alwaysAsk 是强制确认声明；行为读取后再判断当前决定，不使用回调之前的旧状态。
      hook.permissionBehavior === "allow" && decision.decision === "ask" && !decision.alwaysAsk,
  },
  {
    target: "ask",
    reason: "Tool requires approval by PreToolUse hook",
    accepts: (decision: PermissionDecisionResult, hook: HookRunResult) =>
      hook.permissionBehavior === "ask" && decision.decision === "allow",
  },
] as const;

export function applyPreToolPermissionDecision(
  decision: PermissionDecisionResult,
  hook: HookRunResult,
  mode: CollaborationMode,
): PermissionDecisionResult {
  if (decision.decision === "deny") return decision;
  const transition = PRE_TRANSITIONS.find((candidate) => candidate.accepts(decision, hook));
  if (!transition) return decision;
  return {
    ...decision,
    allowed: transition.target === "allow",
    decision: transition.target,
    escalated: transition.target === "ask",
    mode,
    reason: hook.hookPermissionDecisionReason ?? transition.reason,
    ruleId: `hook.PreToolUse.${transition.target}`,
  };
}

const CONTEXT_HEADING = "[Hook additional context]";
export function formatHookAdditionalContexts(contexts: string[]): string {
  const lines = [CONTEXT_HEADING];
  const length = contexts.length;
  for (let index = 0; index < length; index++)
    lines.push(index in contexts ? `#${index + 1}\n${contexts[index]}` : "");
  return lines.join("\n");
}
