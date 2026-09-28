// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { CollaborationMode, ToolExecutionSpanWriter, TraceContext } from "@knorvia/contracts";
import type { HookRunResult } from "../../../hooks/index.js";
import type { ExecutableToolCall, ToolEntry, ToolExecutionResult } from "../../types.js";
import type { ToolExecutorDeps } from "../types.js";

export interface PermissionInvocation {
  deps: ToolExecutorDeps;
  call: ExecutableToolCall;
  entry: ToolEntry;
  input: unknown;
  hook: HookRunResult;
  mode: CollaborationMode;
  trace: TraceContext;
  signal?: AbortSignal;
  telemetry?: ToolExecutionSpanWriter;
}
export type PermissionOutcome =
  | { allowed: true; executionInput: unknown; permissionWaitMs?: number }
  | { allowed: false; result: ToolExecutionResult };
type Stage = "rules" | "denied" | "requested" | "responders" | "recheck" | "resolved" | "grants";
interface Suspension {
  stage: Stage;
  invoke: () => Promise<unknown>;
}
export type PermissionPlan<T = PermissionOutcome> = Generator<Suspension, T, unknown>;

export function* suspend<T>(stage: Stage, invoke: () => Promise<T>): PermissionPlan<T> {
  return (yield { stage, invoke }) as T;
}

/** One suspension owns one port call and one await; business decisions stay in the plan. */
export async function drivePermissionPlan(plan: PermissionPlan): Promise<PermissionOutcome> {
  let cursor = plan.next();
  while (!cursor.done) {
    let value: unknown;
    try {
      value = await cursor.value.invoke();
    } catch (error) {
      cursor = plan.throw(error);
      continue;
    }
    // 计划本身抛出的异常不能被再次注入；这里只捕获端口失败，保持原异常边界。
    cursor = plan.next(value);
  }
  return cursor.value;
}
