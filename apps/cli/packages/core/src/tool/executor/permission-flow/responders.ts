// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  PermissionBrokerRequest,
  PermissionUpdate,
  PreparedPermissionRequest,
} from "@knorvia/contracts";
import type { PermissionDecisionResult } from "../../../permission/service.js";
import type { ResolvedToolApproval } from "../approval/ask-projection.js";
import { runPermissionRequestHooks } from "../hook-flow.js";
import { emitPermissionRequested } from "../events.js";
import { racePermissionResponders } from "../permission-responder-race.js";
import { observeHookFailure } from "./observations.js";
import type { PermissionInvocation } from "./plan-driver.js";
import type { PermissionPublication } from "./publication.js";

/** Bind one request to existing arbitration; the plan remains the only owner of its result. */
export function permissionResponders(
  c: PermissionInvocation,
  decision: PermissionDecisionResult,
  id: string,
  suggestions: PermissionUpdate[],
  approval: ResolvedToolApproval,
  publication: PermissionPublication,
): Parameters<typeof racePermissionResponders>[0] {
  return {
    onHookFailure: (error) => observeHookFailure(c, id, error),
    requestBroker: async (signal, claimResponse) => {
      let prepared: PreparedPermissionRequest | undefined;
      try {
        prepared = await c.deps.permissionBroker.preparePermission(
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
        );
        // 接答登记必须先于 Requested，订阅者立即回答时不能落入尚未就绪的通道。
        await publication.publish(
          () =>
            emitPermissionRequested(
              c.deps,
              c.call,
              c.input,
              id,
              decision.riskLevel,
              decision.reason,
              suggestions,
              c.trace,
              approval,
            ),
          signal,
          prepared.result,
        );
        publication.allowHooks(prepared.activate());
        return await prepared.result;
      } finally {
        publication.close();
        prepared?.dispose();
      }
    },
    runHooks: async (signal) => {
      if (!(await publication.hooks) || signal.aborted) return undefined;
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
