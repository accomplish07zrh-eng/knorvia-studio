// SPDX-License-Identifier: Apache-2.0
// 工具结果的文本化与错误判定（B40）。
// 输出文本优先级：显式 modelContent（字符串原样、块走文本化）→ 失败错误消息 → output 字符串
// → output JSON（缺省空串）。错误判定：!success 即错；output 带显式 isError/is_error 用显式值；
// Bash 且带 interrupted 布尔时先过 Bash 输出错误识别再取 interrupted。其余工具函数：用量换算、
// 输入归一、估算用字符串化（序列化失败回退 String）、MCP 工具名解析（mcp__server__tool）、
// 并行组下标查找。全部同步纯计算；只有 stringifyForEstimation 捕获序列化异常。
import { modelMessageContentToText } from "../../deps.js";
import { isBashOutputProviderError } from "../../../tool/handlers/bash-model-content.js";
import type {
  ModelMessageContent,
  ToolCallId,
  ToolSchedule,
  ToolExecutionResult,
} from "../../deps.js";

// 用量换算后的形状（字段名是兼容接口）。
export type ToolTokenUsageInfo = {
  total?: /* 总量，可能缺席 */ number;
  input: /* 输入 token */ number;
  output: /* 输出 token */ number;
  reasoning: /* 推理 token */ number;
  cache: {
    read: /* 缓存读 */ number;
    write: /* 缓存写 */ number;
  };
};

export function emptyTokenUsageInfo(): ReturnType<typeof toTokenUsageInfo> {
  return {
    cache: { read: 0, write: 0 }, // 全零起步
    reasoning: 0, // 无推理
    output: 0, // 无输出
    input: 0, // 无输入
  };
}

// 用量换算：缺省项按 0，total 原样透传（可能缺席）。
export function toTokenUsageInfo(snapshot?: {
  inputTokens?: /* 原始输入 */ number;
  outputTokens?: /* 原始输出 */ number;
  totalTokens?: /* 原始总量 */ number;
  reasoningTokens?: /* 原始推理 */ number;
  cacheReadTokens?: /* 原始缓存读 */ number;
  cacheWriteTokens?: /* 原始缓存写 */ number;
}): ToolTokenUsageInfo {
  return {
    cache: {
      read: snapshot?.cacheReadTokens ?? 0,
      write: snapshot?.cacheWriteTokens ?? 0,
    },
    reasoning: snapshot?.reasoningTokens ?? 0,
    output: snapshot?.outputTokens ?? 0,
    input: snapshot?.inputTokens ?? 0,
    total: snapshot?.totalTokens,
  };
}

// 输入归一：普通对象原样，其余包进 {value}。
export const toRecordInput = (raw: unknown): Record<string, unknown> => {
  const plainObject = raw && typeof raw === "object" && !Array.isArray(raw);
  return plainObject ? (raw as Record<string, unknown>) : { value: raw };
};

export function stringifyToolResultOutput(outcome: ToolExecutionResult): string {
  const explicitContent = outcome.modelContent;
  if (explicitContent !== undefined) {
    return typeof explicitContent === "string"
      ? explicitContent
      : modelMessageContentToText(explicitContent);
  }
  const failureMessage = !outcome.success ? outcome.error?.message : undefined;
  if (failureMessage) {
    return failureMessage;
  }
  const rawOutput = outcome.output;
  if (typeof rawOutput === "string") {
    return rawOutput;
  }
  return rawOutput === undefined ? "" : (JSON.stringify(rawOutput) ?? "");
}

// 模型内容投影：显式 modelContent 原样；否则用文本化结果。
export function modelContentForToolResult(outcome: ToolExecutionResult): ModelMessageContent {
  return outcome.modelContent !== undefined
    ? outcome.modelContent
    : stringifyToolResultOutput(outcome);
}

// 错误判定：!success 即错；显式 isError/is_error 优先；Bash 走 interrupted/输出错误识别。
export function isErrorForToolResult(outcome: ToolExecutionResult): boolean {
  if (!outcome.success) {
    return true;
  }
  if (!isRecord(outcome.output)) {
    return false;
  }
  const explicitFlag = outcome.output.isError ?? outcome.output.is_error;
  if (typeof explicitFlag === "boolean") {
    return explicitFlag;
  }
  const interruptedFlag = outcome.output.interrupted;
  const bashInterrupted = outcome.toolName === "Bash" && typeof interruptedFlag === "boolean";
  if (!bashInterrupted) {
    return false;
  }
  return isBashOutputProviderError(outcome.output) || interruptedFlag;
}

// 普通对象判定：非 null 的对象且不是数组。
const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);

// 估算用字符串化：序列化异常/undefined 都回退 String(对象)。
export function stringifyForEstimation(subject: unknown): string {
  try {
    const serialized = JSON.stringify(subject);
    return serialized ?? String(subject);
  } catch {
    return String(subject);
  }
}

// MCP 工具名解析：`mcp__<server>__<tool…>`，工具名允许再含 `__`；形态不对返回 undefined。
export function parseMcpToolName(name: string):
  | {
      serverName: string;
      toolName: string;
    }
  | undefined {
  const segments = name.split("__");
  if (!name.startsWith("mcp__") || segments.length < 3) {
    return undefined;
  }
  const serverName = segments[1];
  const toolSegments = segments.slice(2);
  if (!serverName || toolSegments.length === 0) {
    return undefined;
  }
  return { serverName, toolName: toolSegments.join("__") };
}

// 并行组下标：找包含该工具调用 id 的第一个并行组，找不到给 -1。
export function findParallelGroupIndex(schedule: ToolSchedule, toolCallId: ToolCallId): number {
  let hit = -1;
  schedule.parallelGroups.forEach((group, ordinal) => {
    if (hit < 0 && group.includes(toolCallId)) {
      hit = ordinal;
    }
  });
  return hit;
}
