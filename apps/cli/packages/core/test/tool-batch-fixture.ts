// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolCallId } from "@knorvia/contracts";
import type { ToolSchedule } from "../src/tool/scheduler.js";
import type { ExecutableToolCall, ToolExecutionResult } from "../src/tool/types.js";

export { gate, invocation } from "./tool-invocation-fixture.js";

export function calls(count: number): ExecutableToolCall[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `call-${i}`,
    name: "Fixture",
    input: { value: String(i) },
  }));
}

export function result(call: ExecutableToolCall): ToolExecutionResult {
  return {
    toolCallId: call.id,
    toolName: call.name,
    success: true,
    output: call.input,
    durationMs: 0,
    startedAt: new Date(0),
    completedAt: new Date(0),
  };
}

export function plan(...groups: string[][]): ToolSchedule {
  return { items: [], parallelGroups: groups as ToolCallId[][], executionOrder: [] };
}

export async function drain<T, R>(generator: AsyncGenerator<T, R, void>) {
  const events: T[] = [];
  while (true) {
    const next = await generator.next();
    if (next.done) return { events, results: next.value };
    events.push(next.value);
  }
}

export const optionKeys = [
  "automationTurn",
  "offPeakTurn",
  "signal",
  "traceContext",
  "subagentModelOverride",
  "model",
];
