// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolDependency, ToolScheduleItem } from "../scheduler.js";

function parallelDecision(tool: ToolDependency, knownReaders: Set<string>): boolean {
  const named = typeof tool.toolName === "string" && tool.toolName.length > 0;
  const declared =
    tool.readOnly !== undefined ||
    tool.destructive !== undefined ||
    tool.concurrentSafe !== undefined ||
    tool.sideEffectScope !== undefined;
  if (!named && !declared) return true;

  const readonly = tool.readOnly ?? (named ? knownReaders.has(tool.toolName!) : false);
  if (tool.destructive) return false;
  if (tool.concurrentSafe === true) return true;
  if (tool.concurrentSafe === false) return false;
  return readonly ? true : tool.sideEffectScope === "none";
}

export function describeDependency(
  tool: ToolDependency,
  knownReaders: Set<string>,
): ToolScheduleItem {
  return {
    toolCallId: tool.toolCallId,
    toolName: tool.toolName,
    dependencies: tool.dependsOn,
    canRunParallel: parallelDecision(tool, knownReaders),
    // 决策与公开投影的读取时点不同；共用快照会改变已验证的动态元数据合同。
    readOnly: tool.readOnly ?? (tool.toolName ? knownReaders.has(tool.toolName) : undefined),
    destructive: tool.destructive,
    concurrentSafe: tool.concurrentSafe,
    sideEffectScope: tool.sideEffectScope,
  };
}
