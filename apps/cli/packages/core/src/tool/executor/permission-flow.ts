// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { CollaborationMode, ToolExecutionSpanWriter, TraceContext } from "@knorvia/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { permissionPlan } from "./permission-flow/plan.js";
import { drivePermissionPlan, type PermissionOutcome } from "./permission-flow/plan-driver.js";

export function resolveToolPermission(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  entry: ToolEntry,
  executionInput: unknown,
  preToolHookResult: HookRunResult,
  mode: CollaborationMode,
  traceContext: TraceContext,
  signal?: AbortSignal,
  telemetry?: ToolExecutionSpanWriter,
): Promise<PermissionOutcome> {
  return drivePermissionPlan(
    permissionPlan({
      deps,
      call: toolCall,
      entry,
      input: executionInput,
      hook: preToolHookResult,
      mode,
      trace: traceContext,
      signal,
      telemetry,
    }),
  );
}
