// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  createCoreError,
  isCoreError,
  type PermissionBrokerResult,
} from "@knorvia/contracts";
import type { PermissionDecisionResult } from "../../../permission/service.js";
import { createErrorResult, createPermissionErrorResult } from "../errors.js";
import type { PermissionInvocation, PermissionOutcome } from "./plan-driver.js";

type Refusal = Extract<PermissionOutcome, { allowed: false }>;
const STORAGE_FAILURE = "Failed to load project permission rules";
const REQUEST_FAILURE = "Permission request failed";

export function storageRefusal(c: PermissionInvocation, error: unknown): Refusal {
  return {
    allowed: false,
    result: createErrorResult(
      c.call,
      createCoreError(CoreErrorType.StorageError, STORAGE_FAILURE, {
        cause: error instanceof Error ? error : undefined,
        context: { sessionId: c.deps.sessionId, toolCallId: c.call.id, toolName: c.call.name },
        recoverable: true,
      }),
    ),
  };
}

export function requestFailure(c: PermissionInvocation, id: string, error: unknown) {
  return isCoreError(error)
    ? error
    : createCoreError(CoreErrorType.PermissionDenied, REQUEST_FAILURE, {
        cause: error instanceof Error ? error : undefined,
        context: { requestId: id, toolCallId: c.call.id, toolName: c.call.name },
        recoverable: true,
      });
}

export function policyRefusal(
  c: PermissionInvocation,
  decision: PermissionDecisionResult,
): Refusal {
  return {
    allowed: false,
    result: createPermissionErrorResult(c.call, decision.reason, {
      decision: decision.decision,
      mode: c.mode,
      ruleId: decision.ruleId,
    }),
  };
}

export function replyRefusal(
  c: PermissionInvocation,
  reply: PermissionBrokerResult,
  decision: PermissionDecisionResult,
  id: string,
): Refusal | undefined {
  if (reply.decision === "deny") {
    c.telemetry?.setPermissionDecision("denied");
    return {
      allowed: false,
      result: createPermissionErrorResult(
        c.call,
        reply.reason,
        {
          decision: reply.decision,
          mode: c.mode,
          reasonSource: reply.reasonSource,
          requestId: id,
          ruleId: decision.ruleId,
        },
        reply.preserveReasonFormatting ? { preserveReasonFormatting: true } : undefined,
      ),
    };
  }
  if (reply.decision === "escalate") {
    c.telemetry?.setPermissionDecision("denied");
    return {
      allowed: false,
      result: createErrorResult(
        c.call,
        createCoreError(
          CoreErrorType.PermissionEscalation,
          reply.reason ?? `Permission escalation requested for ${c.call.name}`,
          {
            context: {
              decision: reply.decision,
              mode: c.mode,
              requestId: id,
              ruleId: decision.ruleId,
              toolName: c.call.name,
            },
            recoverable: true,
          },
        ),
      ),
    };
  }
}
