// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export function createStreamDiagnostics(): StreamDiagnostics {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function recordStreamChunkDiagnostic(d: StreamDiagnostics, chunk: unknown): void {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function getGenerateTextResultMetadata(result?: AiSdkGenerateTextResult) {
  throw new Error("not implemented: apps-cli-packages-01-model");
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
  throw new Error("not implemented: apps-cli-packages-01-model");
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
  throw new Error("not implemented: apps-cli-packages-01-model");
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
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function logIgnoredStreamChunk(input: {
  attempt: number;
  chunk: unknown;
  logger?: Logger;
  statusContext: ModelStatusContext;
}): void {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function isSuspiciousStreamDiagnostics(d: StreamDiagnostics): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function isZeroOutputModelCompletion(input: {
  finishReason?: string;
  reasoningLength: number;
  textLength: number;
  toolCallCount: number;
  usage?: ModelUsage;
}): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
