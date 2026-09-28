// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  HookOutcome,
  SessionEventType,
  isCoreError,
  traceContextToLogContext,
  type Logger,
  type SessionEvent,
} from "@knorvia/contracts";
import { sanitizeHookDisplayText } from "./display-metadata.js";
import { readHookErrorMessage, resolveHookFailureOutcome } from "./runner-helpers.js";
import type { CallbackValue, HookOccurrence, HookReport } from "./runner-plan.js";
import type {
  HookCallbackDiagnostics,
  HookCallbackResult,
  HookRunAdmissionDecision,
  HookRunResult,
} from "./types.js";

const DIAGNOSTIC_LIMIT = 4000;
const DIAGNOSTIC_FIELDS = ["errorMessage", "stderrPreview", "stdoutPreview"] as const;
const FAILURE_LOG = {
  foreground: { message: "Hook execution failed", event: "hook.run.failed" },
  background: { message: "Async hook execution failed", event: "hook.run.async_failed" },
} as const;

export function unwrapCallbackValue(value: CallbackValue): {
  output: HookCallbackResult["output"];
  diagnostics: HookCallbackDiagnostics | undefined;
} {
  if (value && typeof value === "object" && "kind" in value && value.kind === "hookCallbackResult")
    return { output: value.output, diagnostics: value.diagnostics };
  return { output: value as HookCallbackResult["output"], diagnostics: undefined };
}

export function admissionReport(decision: HookRunAdmissionDecision, durationMs = 0): HookReport {
  return {
    type: SessionEventType.HookRunBlocked,
    fields: {
      durationMs,
      errorCode: decision.reasonCode,
      outcome: HookOutcome.Blocked,
      ...(decision.reasonCode ? { blockReason: sanitizeHookDisplayText(decision.reasonCode) } : {}),
    },
  };
}

export function completionReport(
  result: HookRunResult,
  diagnostics: HookCallbackDiagnostics | undefined,
  durationMs: number,
): HookReport {
  const blocked =
    result.permissionBehavior === "deny" ||
    result.permissionRequestResult?.behavior === "deny" ||
    result.preventContinuation ||
    result.blockRequested;
  const fields: HookReport["fields"] = {
    durationMs,
    outcome: blocked ? HookOutcome.Blocked : HookOutcome.Success,
  };
  if (blocked) {
    const reason = sanitizeHookDisplayText(
      result.stopReason ??
        result.hookPermissionDecisionReason ??
        (result.permissionRequestResult?.behavior === "deny"
          ? result.permissionRequestResult.message
          : undefined) ??
        "Hook blocked execution",
    );
    if (reason) fields.blockReason = reason;
    const safe: HookCallbackDiagnostics = {};
    if (diagnostics)
      for (const field of DIAGNOSTIC_FIELDS) {
        const text = diagnostics[field]?.trim();
        if (text) safe[field] = sanitizeHookDisplayText(text).slice(0, DIAGNOSTIC_LIMIT);
      }
    for (const field of DIAGNOSTIC_FIELDS) if (safe[field]) fields[field] = safe[field];
  }
  return {
    type: blocked ? SessionEventType.HookRunBlocked : SessionEventType.HookRunCompleted,
    fields,
  };
}

export function failureReport(occurrence: HookOccurrence, error: unknown): HookReport {
  const durationMs = Date.now() - occurrence.startedAt;
  const outcome = resolveHookFailureOutcome(error);
  const errorMessage = sanitizeHookDisplayText(readHookErrorMessage(error));
  return {
    type: SessionEventType.HookRunFailed,
    fields: {
      durationMs,
      errorCode: isCoreError(error) ? error.code : undefined,
      errorMessage,
      outcome,
      stderrPreview: errorMessage,
    },
  };
}

export function eventFor(occurrence: HookOccurrence, report: HookReport): SessionEvent {
  const { input, hook } = occurrence;
  return {
    id: crypto.randomUUID() as SessionEvent["id"],
    sessionId: input.sessionId,
    turnId: input.turnId,
    type: report.type,
    timestamp:
      report.type === SessionEventType.HookRunStarted ? new Date(occurrence.startedAt) : new Date(),
    traceId: input.traceId,
    sequenceNumber: 0,
    payload: {
      agentName: input.agentName,
      descriptor: occurrence.descriptor,
      hookEventName: input.hookEventName,
      hookIndex: occurrence.hookIndex,
      hookCount: occurrence.hookCount,
      hookInvocationId: occurrence.hookInvocationId,
      hookRunId: occurrence.hookRunId,
      hookSource: hook.source,
      matcher: hook.matcher,
      requestId: "requestId" in input ? input.requestId : undefined,
      startedAt: occurrence.startedAt,
      toolCallId: "toolCallId" in input ? input.toolCallId : undefined,
      toolName: "toolName" in input ? input.toolName : undefined,
      ...report.fields,
    },
  };
}

function trace(occurrence: HookOccurrence) {
  const { input } = occurrence;
  return traceContextToLogContext({
    traceId: input.traceId,
    sessionId: input.sessionId,
    turnId: input.turnId,
  });
}

export function logHookFailure(
  occurrence: HookOccurrence,
  durationMs: number | undefined,
  logger: Logger | undefined,
  background: boolean,
): void {
  const category = FAILURE_LOG[background ? "background" : "foreground"];
  logger?.warn(category.message, {
    ...trace(occurrence),
    durationMs,
    event: category.event,
    hookEventName: occurrence.input.hookEventName,
    hookIndex: occurrence.hookIndex,
    matcher: occurrence.hook.matcher,
    module: "core.hooks",
    source: occurrence.hook.source,
  });
}

export function logBackgroundReportingFailure(
  occurrence: HookOccurrence,
  error: unknown,
  logger: Logger | undefined,
): void {
  logger?.warn("Async hook lifecycle reporting failed", {
    ...trace(occurrence),
    error: error instanceof Error ? error.message : String(error),
    event: "hook.run.async_reporting_failed",
    hookEventName: occurrence.input.hookEventName,
    hookIndex: occurrence.hookIndex,
    module: "core.hooks",
    source: occurrence.hook.source,
  });
}
