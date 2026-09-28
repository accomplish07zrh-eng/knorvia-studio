// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { HookOutcome, SessionEventType, type HookInput } from "@knorvia/contracts";
import { mergeHookRunResult, processHookOutput } from "./output.js";
import {
  admissionReport,
  completionReport,
  failureReport,
  logHookFailure,
  unwrapCallbackValue,
} from "./runner-lifecycle.js";
import {
  matchesAnyHookMatcher,
  resolveHookDescriptor,
  resolveHookRunAdmission,
} from "./runner-helpers.js";
import type { HookOccurrence, HookPlan, RunnerEnvironment } from "./runner-plan.js";
import type { HookRegistration, HookRunOptions, HookRunResult } from "./types.js";

function* reportFailure(
  occurrence: HookOccurrence,
  error: unknown,
  environment: RunnerEnvironment,
  background: boolean,
): HookPlan<void> {
  const report = failureReport(occurrence, error);
  yield { kind: "publish", occurrence, report };
  logHookFailure(occurrence, report.fields?.durationMs, environment.logger, background);
}

export function* backgroundPlan(
  occurrence: HookOccurrence,
  signal: AbortSignal | undefined,
  environment: RunnerEnvironment,
): HookPlan<void> {
  try {
    yield { kind: "callback", occurrence, signal };
    yield {
      kind: "publish",
      occurrence,
      report: {
        type: SessionEventType.HookRunCompleted,
        fields: {
          durationMs: Date.now() - occurrence.startedAt,
          outcome: HookOutcome.Success,
        },
      },
    };
  } catch (error) {
    yield* reportFailure(occurrence, error, environment, true);
  }
}

export function* batchPlan(
  registrations: readonly HookRegistration[],
  input: HookInput,
  options: HookRunOptions,
  environment: RunnerEnvironment,
): HookPlan<HookRunResult> {
  // 成员身份在首次等待前固定；登记对象仍按原合同保持活引用。
  const matching = registrations.filter(
    (hook) => hook.event === input.hookEventName && matchesAnyHookMatcher(options, hook.matcher),
  );
  const result: HookRunResult = { additionalContexts: [] };
  const hookInvocationId = crypto.randomUUID();
  const participants: HookRegistration[] = [];
  for (const hook of matching) {
    if (!resolveHookRunAdmission(hook, input, environment.logger).skipLifecycle)
      participants.push(hook);
  }
  let hookCount = 0;
  for (const hook of participants)
    if (resolveHookDescriptor(hook, environment.defaultTimeoutMs, input).clientVisible) hookCount++;
  let visibleIndex = 0;
  for (const [runtimeIndex, hook] of participants.entries()) {
    const descriptor = resolveHookDescriptor(hook, environment.defaultTimeoutMs, input);
    const occurrence: HookOccurrence = {
      input,
      hook,
      descriptor,
      hookIndex: descriptor.clientVisible ? visibleIndex++ : runtimeIndex,
      hookCount,
      hookInvocationId,
      hookRunId: crypto.randomUUID(),
      startedAt: Date.now(),
      runtimeIndex,
    };
    const before = resolveHookRunAdmission(hook, input, environment.logger);
    if (!before.allowed) {
      yield { kind: "publish", occurrence, report: admissionReport(before) };
      continue;
    }
    yield { kind: "publish", occurrence, report: { type: SessionEventType.HookRunStarted } };
    // Started 发布可等待任意时间；先前授权此时可能已撤销。复验与实际回调之间
    // 不再等待；即使新决定是 skipLifecycle，也要关闭已发布的同一 Started。
    const dispatch = resolveHookRunAdmission(hook, input, environment.logger);
    if (!dispatch.allowed || dispatch.skipLifecycle) {
      // 已有 Started 的拒绝也须计入发布等待时长；只有开始前拒绝仍为零。
      yield {
        kind: "publish",
        occurrence,
        report: admissionReport(dispatch, Date.now() - occurrence.startedAt),
      };
      continue;
    }
    if (hook.async) {
      // signal 在原背景分支的异常边界外读取；detach 不增加异步让出点。
      yield { kind: "detach", occurrence, signal: options.signal };
      continue;
    }
    try {
      const value = yield { kind: "callback", occurrence, signal: options.signal };
      const { output, diagnostics } = unwrapCallbackValue(value);
      const durationMs = Date.now() - occurrence.startedAt;
      const projected = processHookOutput(input.hookEventName, output);
      mergeHookRunResult(result, projected);
      yield {
        kind: "publish",
        occurrence,
        report: completionReport(projected, diagnostics, durationMs),
      };
    } catch (error) {
      yield* reportFailure(occurrence, error, environment, false);
    }
  }
  return result;
}
