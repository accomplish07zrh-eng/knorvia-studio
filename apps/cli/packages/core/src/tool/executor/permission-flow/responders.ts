// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionBrokerRequest, PermissionUpdate } from "@knorvia/contracts";
import type { PermissionDecisionResult } from "../../../permission/service.js";
import type { ResolvedToolApproval } from "../approval/ask-projection.js";
import { runPermissionRequestHooks } from "../hook-flow.js";
import { racePermissionResponders } from "../permission-responder-race.js";
import { observeHookFailure } from "./observations.js";
import type { PermissionInvocation } from "./plan-driver.js";

/** Bind one request to existing arbitration; the plan remains the only owner of its result. */
export function permissionResponders(
  c: PermissionInvocation,
  decision: PermissionDecisionResult,
  id: string,
  suggestions: PermissionUpdate[],
  approval: ResolvedToolApproval,
): Parameters<typeof racePermissionResponders>[0] {
  return {
    onHookFailure: (error) => observeHookFailure(c, id, error),
    requestBroker: (signal, claimResponse) =>
      c.deps.permissionBroker.requestPermission(
        {
          input: c.input,
          mode: c.mode,
          reason: decision.reason ?? `Tool ${c.call.name} requires approval`,
          requestId: id,
          requestedAt: new Date(),
          riskLevel: decision.riskLevel,
          ruleId: decision.ruleId,
          sessionId: c.deps.sessionId,
          sideEffectScope: decision.sideEffectScope,
          suggestedPermissionUpdates: suggestions,
          ...(approval.optionsPolicy ? { optionsPolicy: approval.optionsPolicy } : {}),
          toolCallId: c.call.id as PermissionBrokerRequest["toolCallId"],
          toolName: c.call.name,
          traceId: c.trace.traceId,
          turnId: c.trace.turnId ?? c.deps.turnId,
        },
        { signal, claimResponse, timeoutMs: c.deps.permissionTimeoutMs },
      ),
    runHooks: async (signal) => {
      const reply = await runPermissionRequestHooks(
        c.deps,
        c.call,
        c.input,
        id,
        decision,
        c.mode,
        c.trace,
        signal,
      );
      // Windows 接管只接受用户本次授权；自动 allow/modify 退赛，deny 仍可拒绝。
      if (
        c.entry.approvalAuthority === "user" &&
        (reply?.decision === "allow" || reply?.decision === "modify")
      )
        return undefined;
      return reply;
    },
    ...(c.signal === undefined ? {} : { signal: c.signal }),
  };
}
