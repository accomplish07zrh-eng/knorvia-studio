// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { runOwnedCallback } from "./runner-callback.js";
import { logBackgroundReportingFailure } from "./runner-lifecycle.js";
import { backgroundPlan } from "./runner-program.js";
import type {
  CallbackValue,
  HookOccurrence,
  HookPlan,
  HookReport,
  RunnerEnvironment,
} from "./runner-plan.js";

export interface HookPorts extends RunnerEnvironment {
  publish(occurrence: HookOccurrence, report: HookReport): Promise<void>;
}

export async function driveHookPlan<Result>(
  plan: HookPlan<Result>,
  ports: HookPorts,
): Promise<Result> {
  let cursor = plan.next();
  while (!cursor.done) {
    const step = cursor.value;
    if (step.kind === "detach") {
      void driveHookPlan(backgroundPlan(step.occurrence, step.signal, ports), ports).catch(
        (error) => logBackgroundReportingFailure(step.occurrence, error, ports.logger),
      );
      cursor = plan.next();
      continue;
    }
    let value: CallbackValue = undefined;
    let rejected = false;
    let failure: unknown;
    try {
      value = await (step.kind === "publish"
        ? ports.publish(step.occurrence, step.report)
        : runOwnedCallback(step.occurrence, step.signal, ports.defaultTimeoutMs));
    } catch (error) {
      rejected = true;
      failure = error;
    }
    // 只把端口异常送回计划。计划自身（例如失败日志）的异常直接拒绝驱动，
    // 不能再次 throw 回同一个生成器，造成重复 Failed 或吞掉原异常。
    cursor = rejected ? plan.throw(failure) : plan.next(value);
  }
  return cursor.value;
}
