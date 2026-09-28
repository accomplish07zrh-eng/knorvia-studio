// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  createCoreError,
  createRootTraceContext,
  traceContextToLogContext,
} from "@knorvia/contracts";
import type { ToolSchedule } from "../scheduler.js";
import type { ExecutableToolCall, ToolBatchEvent, ToolExecutionResult } from "../types.js";
import { ScheduleLedger, WaveLedger } from "./batches/execution-ledger.js";
import { createErrorResult } from "./errors.js";
import { emitToolCallError } from "./events.js";
import type { ToolBatchExecuteOptions, ToolExecuteOptions, ToolExecutorDeps } from "./types.js";

const STOPPED_TURN_MESSAGE = "Tool cancelled because a previous tool result requested a turn stop.";
type ExecuteOne = (
  call: ExecutableToolCall,
  options?: ToolExecuteOptions,
) => Promise<ToolExecutionResult>;
type ExecuteBatch = (
  calls: ExecutableToolCall[],
  options?: ToolBatchExecuteOptions,
) => Promise<ToolExecutionResult[]>;

function invocationOptions(options?: ToolExecuteOptions): ToolExecuteOptions {
  return {
    automationTurn: options?.automationTurn,
    // Runtime 已传入低峰标记；调度时遗漏会让工具脱离该回合策略，故在同一投影处转发。
    offPeakTurn: options?.offPeakTurn,
    signal: options?.signal,
    traceContext: options?.traceContext,
    subagentModelOverride: options?.subagentModelOverride,
    model: options?.model,
  };
}

export async function executeToolBatch(
  deps: ToolExecutorDeps,
  executeOne: ExecuteOne,
  toolCalls: ExecutableToolCall[],
  options?: ToolBatchExecuteOptions,
): Promise<ToolExecutionResult[]> {
  const width = options?.maxConcurrency ?? deps.maxConcurrency;
  if (toolCalls.length <= width) {
    return Promise.all(toolCalls.map((call) => executeOne(call, options)));
  }
  const ledger = new WaveLedger(toolCalls, width);
  let selected = ledger.select();
  while (selected !== undefined) {
    const outcomes = await Promise.all(
      selected.map((call) => executeOne(call, invocationOptions(options))),
    );
    ledger.complete(outcomes);
    selected = ledger.select();
  }
  return ledger.results;
}

export async function* executeToolSchedule(
  deps: ToolExecutorDeps,
  executeBatch: ExecuteBatch,
  toolCalls: ExecutableToolCall[],
  schedule: ToolSchedule,
  options?: ToolBatchExecuteOptions,
): AsyncGenerator<ToolBatchEvent, ToolExecutionResult[], void> {
  const ledger = new ScheduleLedger(toolCalls, schedule);
  const width = options?.maxConcurrency ?? deps.maxConcurrency;
  let group = ledger.select();
  while (group !== undefined) {
    yield { type: "batch_start", parallelGroupIndex: group.index, toolCallIds: group.ids };
    const outcomes = await executeBatch(group.calls, {
      ...invocationOptions(options),
      maxConcurrency: width,
    });
    ledger.record(outcomes);
    yield { type: "batch_complete", parallelGroupIndex: group.index, results: outcomes };

    // 消费者在批完成事件处仍可能修改结果；停止决定必须留在恢复后的同一段执行中。
    if (outcomes.some((outcome) => outcome.turnControl?.stopTurnAfterResult === true)) {
      const pending = ledger.remainder();
      const trace =
        options?.traceContext ??
        deps.traceContext ??
        createRootTraceContext({ sessionId: deps.sessionId, turnId: deps.turnId });
      const turnId = trace.turnId ?? deps.turnId;
      for (const call of pending) {
        const cancelled = createErrorResult(
          call,
          createCoreError(CoreErrorType.ToolCancelled, STOPPED_TURN_MESSAGE, {
            context: { toolCallId: call.id, toolName: call.name },
            recoverable: true,
          }),
        );
        ledger.record([cancelled]);
        await emitToolCallError(deps, cancelled.toolCallId, trace, turnId, cancelled.error);
        deps.logger?.warn("Tool call cancelled after turn stop", {
          ...traceContextToLogContext(trace),
          event: "tool.call.cancelled_after_turn_stop",
          module: "core.tool.executor",
          status: "cancelled",
          toolCallId: cancelled.toolCallId,
          toolName: cancelled.toolName,
        });
      }
      break;
    }
    group = ledger.select();
  }
  return ledger.results;
}
