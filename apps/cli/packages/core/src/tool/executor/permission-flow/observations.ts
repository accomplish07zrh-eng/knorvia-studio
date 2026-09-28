// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { traceContextToLogContext, type PermissionBrokerResult } from "@knorvia/contracts";
import type { PermissionDecisionResult } from "../../../permission/service.js";
import { summarizeInput } from "../utils.js";
import type { PermissionInvocation } from "./plan-driver.js";

const MODULE = "core.tool.executor";

export function observeAssessment(c: PermissionInvocation, decision: PermissionDecisionResult) {
  c.deps.logger?.debug("Tool permission evaluated", {
    ...traceContextToLogContext(c.trace),
    decision: decision.decision,
    event: "tool.permission.evaluated",
    inputSummary: summarizeInput(c.call.input),
    mode: c.mode,
    module: MODULE,
    reason: decision.reason,
    riskLevel: decision.riskLevel,
    ruleId: decision.ruleId,
    sideEffectScope: decision.sideEffectScope,
    status:
      decision.decision === "allow"
        ? "completed"
        : decision.decision === "ask"
          ? "waiting"
          : "failed",
    toolCallId: c.call.id,
    toolName: c.call.name,
  });
}

export function observeDenial(c: PermissionInvocation, decision: PermissionDecisionResult) {
  c.deps.logger?.warn("Tool permission denied", {
    ...traceContextToLogContext(c.trace),
    decision: decision.decision,
    event: "tool.permission.denied",
    mode: c.mode,
    module: MODULE,
    reason: decision.reason,
    ruleId: decision.ruleId,
    status: "failed",
    toolCallId: c.call.id,
    toolName: c.call.name,
  });
}

export function observeResolution(
  c: PermissionInvocation,
  reply: PermissionBrokerResult,
  id: string,
) {
  c.deps.logger?.info("Tool permission resolved", {
    ...traceContextToLogContext(c.trace),
    decision: reply.decision,
    event: "tool.permission.resolved",
    mode: c.mode,
    module: MODULE,
    reason: reply.reason,
    requestId: id,
    status: reply.decision === "allow" || reply.decision === "modify" ? "completed" : "failed",
    toolCallId: c.call.id,
    toolName: c.call.name,
  });
}

export function observeHookFailure(c: PermissionInvocation, id: string, error: unknown) {
  c.deps.logger?.warn("PermissionRequest hook chain failed; waiting for client decision", {
    ...traceContextToLogContext(c.trace),
    errorMessage: error instanceof Error ? error.message : String(error),
    event: "tool.permission.hook_race_forfeited",
    module: MODULE,
    requestId: id,
    status: "waiting",
    toolCallId: c.call.id,
    toolName: c.call.name,
  });
}
