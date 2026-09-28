// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  HookOutcome,
  createCoreError,
  isCoreError,
  type HookExecutionDescriptor,
  type HookInput,
  type Logger,
} from "@knorvia/contracts";
import { matchesHookMatcher } from "./output.js";
import type { HookRegistration, HookRunAdmissionDecision, HookRunOptions } from "./types.js";

export const HOOK_TIMEOUT_ABORT_REASON = Symbol("hook-timeout");
const FAILURE_OUTCOMES = [
  [CoreErrorType.ToolTimeout, HookOutcome.TimedOut],
  [CoreErrorType.ToolCancelled, HookOutcome.Cancelled],
] as const;
const INTERNAL_DESCRIPTOR = {
  clientVisible: false,
  executionType: "process",
  sourceKind: "internal",
} as const;

export function resolveHookRunAdmission(
  hook: HookRegistration,
  input: HookInput,
  logger?: Logger,
): HookRunAdmissionDecision {
  if (!hook.admission) return { allowed: true };
  try {
    return hook.admission(input);
  } catch (error) {
    // 准入故障只能关闭执行入口，不能从异常推导出授权。
    logger?.warn("Hook admission gate failed closed", {
      error: error instanceof Error ? error.message : String(error),
      event: "hook.admission.failed_closed",
      hookEventName: input.hookEventName,
      module: "core.hooks",
      source: hook.source,
    });
    return { allowed: false, reasonCode: "workspace_hooks_blocked_untrusted" };
  }
}

export function matchesAnyHookMatcher(
  options: HookRunOptions,
  matcher: string | undefined,
): boolean {
  if (!matcher) return true;
  const aliases = new Set(options.matchValues ?? []);
  if (options.matchValue) aliases.add(options.matchValue);
  for (const alias of aliases) if (matchesHookMatcher(alias, matcher)) return true;
  return aliases.size === 0;
}

export function linkAbortSignal(
  parent: AbortSignal | undefined,
  child: AbortController,
): () => void {
  const transfer = () => {
    if (!child.signal.aborted) child.abort(parent?.reason);
  };
  if (parent && !parent.aborted) {
    parent.addEventListener("abort", transfer);
    return () => parent.removeEventListener("abort", transfer);
  }
  if (parent) transfer();
  return () => {};
}

export function createHookTimeoutError(timeoutMs: number): Error {
  return createCoreError(CoreErrorType.ToolTimeout, `Hook timed out after ${timeoutMs}ms`, {
    recoverable: true,
  });
}
export function createHookCancelledError(): Error {
  return createCoreError(CoreErrorType.ToolCancelled, "Hook execution cancelled", {
    recoverable: true,
  });
}
export function resolveHookFailureOutcome(error: unknown): HookOutcome {
  if (isCoreError(error))
    for (const [type, outcome] of FAILURE_OUTCOMES) if (error.type === type) return outcome;
  return HookOutcome.Failed;
}
export function readHookErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return (
    (isCoreError(error) && error.cause instanceof Error && error.cause.message) || error.message
  );
}

export function resolveHookDescriptor(
  hook: HookRegistration,
  defaultTimeoutMs: number,
  input: HookInput,
): HookExecutionDescriptor {
  if (typeof hook.descriptor === "function") return hook.descriptor(input);
  const configured = hook.descriptor;
  if (configured != null) return configured;
  return {
    clientVisible: INTERNAL_DESCRIPTOR.clientVisible,
    commandDisplay: hook.source ?? "Internal hook",
    executionMode: hook.async === true ? "background" : "foreground",
    executionType: INTERNAL_DESCRIPTOR.executionType,
    sourceKind: INTERNAL_DESCRIPTOR.sourceKind,
    timeoutMs: hook.timeoutMs ?? defaultTimeoutMs,
  };
}
