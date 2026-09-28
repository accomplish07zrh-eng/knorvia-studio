// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  HookExecutionDescriptor,
  HookRunLifecyclePayload,
  PreToolUseHookInput,
  SessionEvent,
} from "@knorvia/contracts";

export function runnerInput(): PreToolUseHookInput {
  return {
    cwd: ".",
    hookEventName: "PreToolUse",
    mode: "build",
    sessionId: "runner-fixture" as PreToolUseHookInput["sessionId"],
    traceId: "runner-trace" as PreToolUseHookInput["traceId"],
    timestamp: "2026-09-28T00:00:00Z",
    riskLevel: "low",
    toolCallId: "runner-call",
    toolName: "Fixture",
    toolInput: { value: "original" },
  };
}
export function descriptor(visible = true): HookExecutionDescriptor {
  return {
    clientVisible: visible,
    commandDisplay: "fixture",
    executionMode: "foreground",
    executionType: "process",
    sourceKind: "project",
    timeoutMs: 1000,
  };
}
export function hookPayload(event: SessionEvent): HookRunLifecyclePayload {
  return event.payload as HookRunLifecyclePayload;
}
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
