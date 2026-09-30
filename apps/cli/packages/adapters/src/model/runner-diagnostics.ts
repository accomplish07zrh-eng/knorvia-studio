// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { Logger, ModelUsage } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import type { AiSdkGenerateTextResult } from "./runner-runtime.js";
import type { ModelStatusContext } from "./runner-status.js";
interface StreamDiagnostics {
  chunkCounts: Record<string, number>;
  errorChunkCount: number;
  finishReason?: string;
  lastChunkType?: string;
  lastErrorChunk?: unknown;
  lastFinishChunk?: unknown;
  rawFinishReason?: unknown;
  reasoningDeltaChars: number;
  textDeltaChars: number;
  toolCallCount: number;
  usage?: ModelUsage;
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
export function recordStreamChunkDiagnostic(d: StreamDiagnostics, chunk: unknown): void {
  if (typeof chunk !== "object" || chunk === null) return;
  const value = chunk as Record<string, unknown>;
  const type = String(value.type ?? "unknown");
  d.chunkCounts[type] = (d.chunkCounts[type] ?? 0) + 1;
  d.lastChunkType = type;
  if (type === "error") {
    d.errorChunkCount += 1;
    d.lastErrorChunk = chunk;
  }
  if (type === "finish") {
    d.lastFinishChunk = chunk;
    d.finishReason = String(value.finishReason ?? "");
    d.rawFinishReason = value.rawFinishReason;
  }
  if (type === "text-delta") d.textDeltaChars += String(value.text ?? value.delta ?? "").length;
  if (type === "reasoning-delta")
    d.reasoningDeltaChars += String(value.text ?? value.delta ?? "").length;
  if (type === "tool-call") d.toolCallCount += 1;
}
export function getGenerateTextResultMetadata(result?: AiSdkGenerateTextResult) {
  return result as
    | (AiSdkGenerateTextResult & {
        request?: { body?: unknown };
        response?: {
          body?: unknown;
          headers?: Record<string, string>;
          id?: string;
          messages?: unknown[];
          modelId?: string;
          timestamp?: Date;
        };
        steps?: unknown[];
      })
    | undefined;
}
export function logGenerateTextDiagnostics(input: {
  attempt: number;
  completedAt: number;
  logger?: Logger;
  result: AiSdkGenerateTextResult;
  startedAt: number;
  statusContext: ModelStatusContext;
  toolCallCount: number;
  usage: ModelUsage;
}): void {
  input.logger?.debug("Model generate completed", {
    attempt: input.attempt,
    durationMs: input.completedAt - input.startedAt,
    requestId: input.statusContext.requestId,
    toolCallCount: input.toolCallCount,
    usage: input.usage,
  });
}
export function logStreamDiagnostics(input: {
  attempt: number;
  diagnostics: StreamDiagnostics;
  durationMs: number;
  emittedError: boolean;
  emittedEvent: boolean;
  logger?: Logger;
  outboundHeaders?: Record<string, string>;
  statusContext: ModelStatusContext;
}): void {
  input.logger?.debug("Model stream completed", {
    attempt: input.attempt,
    durationMs: input.durationMs,
    requestId: input.statusContext.requestId,
    diagnostics: input.diagnostics,
  });
}
export function logStreamFailureDiagnostics(input: {
  attempt: number;
  canRetry: boolean;
  diagnostics: StreamDiagnostics;
  durationMs: number;
  emittedError: boolean;
  emittedEvent: boolean;
  emittedRetryBoundaryEvent: boolean;
  error: unknown;
  failure: ClassifiedModelFailure;
  logger?: Logger;
  statusContext: ModelStatusContext;
}): void {
  input.logger?.warn("Model stream failed", {
    attempt: input.attempt,
    canRetry: input.canRetry,
    durationMs: input.durationMs,
    reason: input.failure.reason,
    requestId: input.statusContext.requestId,
    diagnostics: input.diagnostics,
  });
}
export function logIgnoredStreamChunk(input: {
  attempt: number;
  chunk: unknown;
  logger?: Logger;
  statusContext: ModelStatusContext;
}): void {
  input.logger?.debug("Ignored model stream chunk", {
    attempt: input.attempt,
    requestId: input.statusContext.requestId,
    type:
      typeof input.chunk === "object" && input.chunk !== null
        ? (input.chunk as { type?: unknown }).type
        : undefined,
  });
}
export function isSuspiciousStreamDiagnostics(d: StreamDiagnostics): boolean {
  return (
    d.errorChunkCount > 0 ||
    (!d.finishReason && d.textDeltaChars + d.reasoningDeltaChars + d.toolCallCount === 0)
  );
}
export function isZeroOutputModelCompletion(input: {
  finishReason?: string;
  reasoningLength: number;
  textLength: number;
  toolCallCount: number;
  usage?: ModelUsage;
}): boolean {
  return (
    input.textLength === 0 &&
    input.reasoningLength === 0 &&
    input.toolCallCount === 0 &&
    !input.usage?.inputTokens &&
    !input.usage?.outputTokens &&
    !input.usage?.totalTokens
  );
}
