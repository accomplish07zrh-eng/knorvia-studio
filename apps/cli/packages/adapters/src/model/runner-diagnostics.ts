// SPDX-License-Identifier: Apache-2.0
// 流诊断与零输出判定：按 chunk 类型累计计数与首末快照，供完成/失败日志与空补全判定使用。
// 日志文案与零输出判据（文本/推理/工具/用量全空）逐字保持。

import type { Logger, ModelUsage } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import type { AiSdkGenerateTextResult } from "./runner-runtime.js";
import type { ModelStatusContext } from "./runner-status.js";

interface StreamDiagnostics {
  chunkCounts: Record<string, number>; // 按 chunk 类型计数
  errorChunkCount: number; // error chunk 数
  finishReason?: string; // 最终 finishReason（空串也算给出）
  lastChunkType?: string; // 最后一个 chunk 类型
  lastErrorChunk?: unknown; // 最后一个 error chunk
  lastFinishChunk?: unknown; // 最后一个 finish chunk
  rawFinishReason?: unknown; // provider 原始 finish 字段
  reasoningDeltaChars: number; // reasoning 增量字符数
  textDeltaChars: number; // 文本增量字符数
  toolCallCount: number; // 工具调用数
  usage?: ModelUsage; // 用量快照
}

export function createStreamDiagnostics(): StreamDiagnostics {
  return {
    chunkCounts: {},
    errorChunkCount: 0,
    reasoningDeltaChars: 0,
    textDeltaChars: 0,
    toolCallCount: 0,
  };
}

function countChunk(diag: StreamDiagnostics, type: string): void {
  diag.chunkCounts[type] = (diag.chunkCounts[type] ?? 0) + 1;
  diag.lastChunkType = type;
}

function textLength(chunk: Record<string, unknown>): number {
  return String(chunk.text ?? chunk.delta ?? "").length;
}

export function recordStreamChunkDiagnostic(diag: StreamDiagnostics, chunk: unknown): void {
  if (typeof chunk !== "object" || chunk === null) return;
  const value = chunk as Record<string, unknown>;
  const type = String(value.type ?? "unknown");
  countChunk(diag, type);
  switch (type) {
    case "error":
      diag.errorChunkCount += 1;
      diag.lastErrorChunk = chunk;
      break;
    case "finish":
      diag.lastFinishChunk = chunk;
      diag.finishReason = String(value.finishReason ?? "");
      diag.rawFinishReason = value.rawFinishReason;
      break;
    case "text-delta":
      diag.textDeltaChars += textLength(value);
      break;
    case "reasoning-delta":
      diag.reasoningDeltaChars += textLength(value);
      break;
    case "tool-call":
      diag.toolCallCount += 1;
      break;
    default:
      break;
  }
}

interface MetadataView {
  request?: { body?: unknown }; // SDK 请求副本
  response?: {
    body?: unknown; // 响应体副本
    headers?: Record<string, string>; // 响应头
    id?: string; // 响应 id
    messages?: unknown[]; // 消息列表
    modelId?: string; // 实际模型
    timestamp?: Date; // 响应时刻
  };
  steps?: unknown[]; // 多步执行明细
}

export function getGenerateTextResultMetadata(
  result?: AiSdkGenerateTextResult,
): (AiSdkGenerateTextResult & MetadataView) | undefined {
  return result as (AiSdkGenerateTextResult & MetadataView) | undefined;
}

interface GenerateDiagReport {
  attempt: number; // 物理序号
  completedAt: number; // 完成时刻
  logger?: Logger; // 诊断日志口
  result: AiSdkGenerateTextResult; // SDK 结果
  startedAt: number; // 起始时刻
  statusContext: ModelStatusContext; // 归因上下文
  toolCallCount: number; // 工具调用数
  usage: ModelUsage; // 用量
}

export function logGenerateTextDiagnostics(report: GenerateDiagReport): void {
  report.logger?.debug("Model generate completed", {
    attempt: report.attempt,
    durationMs: report.completedAt - report.startedAt,
    requestId: report.statusContext.requestId,
    toolCallCount: report.toolCallCount,
    usage: report.usage,
  });
}

interface StreamDiagReport {
  attempt: number; // 物理序号
  diagnostics: StreamDiagnostics; // 流诊断快照
  durationMs: number; // 持续毫秒
  emittedError: boolean; // 是否发过 error
  emittedEvent: boolean; // 是否发过任何事件
  logger?: Logger; // 诊断日志口
  outboundHeaders?: Record<string, string>; // 出站头快照
  statusContext: ModelStatusContext; // 归因上下文
}

export function logStreamDiagnostics(report: StreamDiagReport): void {
  report.logger?.debug("Model stream completed", {
    attempt: report.attempt,
    durationMs: report.durationMs,
    requestId: report.statusContext.requestId,
    diagnostics: report.diagnostics,
  });
}

interface StreamFailureReport {
  attempt: number; // 物理序号
  canRetry: boolean; // 本轮裁决
  diagnostics: StreamDiagnostics; // 流诊断快照
  durationMs: number; // 持续毫秒
  emittedError: boolean; // 是否发过 error
  emittedEvent: boolean; // 是否发过任何事件
  emittedRetryBoundaryEvent: boolean; // 是否发过重试边界事件
  error: unknown; // 原始错误
  failure: ClassifiedModelFailure; // 失败分类
  logger?: Logger; // 诊断日志口
  statusContext: ModelStatusContext; // 归因上下文
}

export function logStreamFailureDiagnostics(report: StreamFailureReport): void {
  report.logger?.warn("Model stream failed", {
    attempt: report.attempt,
    canRetry: report.canRetry,
    durationMs: report.durationMs,
    reason: report.failure.reason,
    requestId: report.statusContext.requestId,
    diagnostics: report.diagnostics,
  });
}

interface IgnoredChunkReport {
  attempt: number; // 物理序号
  chunk: unknown; // 被忽略的 chunk
  logger?: Logger; // 诊断日志口
  statusContext: ModelStatusContext; // 归因上下文
}

export function logIgnoredStreamChunk(report: IgnoredChunkReport): void {
  const type =
    typeof report.chunk === "object" && report.chunk !== null
      ? (report.chunk as { type?: unknown }).type
      : undefined;
  report.logger?.debug("Ignored model stream chunk", {
    attempt: report.attempt,
    requestId: report.statusContext.requestId,
    type,
  });
}

export function isSuspiciousStreamDiagnostics(diag: StreamDiagnostics): boolean {
  if (diag.errorChunkCount > 0) return true;
  const produced = diag.textDeltaChars + diag.reasoningDeltaChars + diag.toolCallCount;
  return !diag.finishReason && produced === 0;
}

export function isZeroOutputModelCompletion(input: {
  finishReason?: string;
  reasoningLength: number;
  textLength: number;
  toolCallCount: number;
  usage?: ModelUsage;
}): boolean {
  const producedContent = input.textLength === 0 && input.reasoningLength === 0;
  const producedTools = input.toolCallCount === 0;
  const producedTokens =
    !input.usage?.inputTokens && !input.usage?.outputTokens && !input.usage?.totalTokens;
  return producedContent && producedTools && producedTokens;
}
