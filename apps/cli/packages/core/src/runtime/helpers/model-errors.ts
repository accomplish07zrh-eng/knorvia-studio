import { CoreErrorType, ModelErrorCode, createCoreError, isCoreError } from "../deps.js";
import type { ModelUsage } from "../deps.js";
import { isPlainRecord, stringProperty } from "./data.js";
import {
  createCoreErrorFromProviderBusinessLike,
  findProviderBusinessFailureInMetadata,
} from "./provider-business-error.js";

const contextMarkers = new Set<string>([
  CoreErrorType.ModelContextExceeded,
  ModelErrorCode.ModelContextExceeded,
  "context_exceeded",
  "context_length_exceeded",
  "context_window_exceeded",
  "model_context_window_exceeded",
  "prompt_too_long",
]);

const mediaMarkers = new Set<string>([
  "media_too_large",
  "media_payload_too_large",
  "image_too_large",
  "document_too_large",
]);

function isContextMarker(value: string | undefined): boolean {
  return value !== undefined && contextMarkers.has(value.trim().toLowerCase());
}

function isMediaMarker(value: string | undefined): boolean {
  return value !== undefined && mediaMarkers.has(value.trim().toLowerCase());
}

function isContextMessage(value: string | undefined): boolean {
  if (value === undefined) return false;
  const message = value.trim().toLowerCase();
  if (!message) return false;
  return (
    (message.includes("context") && message.includes("exceed")) ||
    (message.includes("context") && message.includes("too long")) ||
    (message.includes("prompt") && message.includes("too long"))
  );
}

function isMediaMessage(value: string | undefined): boolean {
  if (value === undefined) return false;
  const message = value.trim().toLowerCase();
  if (!message) return false;
  return (
    (message.includes("media") || message.includes("image") || message.includes("document")) &&
    (message.includes("too large") || message.includes("exceed"))
  );
}

export function readRawFinishReason(
  providerMetadata: Record<string, unknown> | undefined,
): string | undefined {
  if (!providerMetadata) return undefined;
  const rawFinishReason = providerMetadata.rawFinishReason;
  return typeof rawFinishReason === "string" ? rawFinishReason : undefined;
}

export function isContextExceededFinishReason(
  finishReason: string | undefined,
  rawFinishReason: string | undefined,
): boolean {
  return isContextMarker(finishReason) || isContextMarker(rawFinishReason);
}

export function createModelContextExceededFinishError(input: {
  finishReason: string | undefined;
  rawFinishReason: string | undefined;
}): ReturnType<typeof createCoreError> {
  return createCoreError(
    CoreErrorType.ModelContextExceeded,
    "Model request exceeded the provider context window.",
    {
      context: {
        finishReason: input.finishReason,
        rawFinishReason: input.rawFinishReason,
      },
      recoverable: true,
      retryable: true,
    },
  );
}

export function createCompactRapidRefillError(input: {
  consecutiveRapidRefills: number;
  maxConsecutiveRapidRefills: number;
  toolTurnThreshold: number;
  toolTurnsSinceCompact: number;
}): ReturnType<typeof createCoreError> {
  return createCoreError(
    CoreErrorType.ModelContextExceeded,
    `Autocompact stopped because the context refilled within fewer than ${input.toolTurnThreshold} tool turns after compaction ${input.maxConsecutiveRapidRefills} times in a row. A file or tool output may be too large. Read it in smaller chunks, or start a new session.`,
    {
      context: {
        consecutiveRapidRefills: input.consecutiveRapidRefills,
        maxConsecutiveRapidRefills: input.maxConsecutiveRapidRefills,
        reason: "compact_rapid_refill_breaker",
        toolTurnsSinceCompact: input.toolTurnsSinceCompact,
        toolTurnThreshold: input.toolTurnThreshold,
      },
      recoverable: true,
      retryable: true,
    },
  );
}

function hasZeroUsage(usage: ModelUsage | undefined): boolean {
  if (!usage) return true;
  return (
    (usage.totalTokens ??
      (usage.inputTokens ?? 0) +
        (usage.outputTokens ?? 0) +
        (usage.cacheReadTokens ?? 0) +
        (usage.cacheWriteTokens ?? 0) +
        (usage.reasoningTokens ?? 0)) === 0
  );
}

export function isSuspiciousEmptyModelResult(
  finishReason: string | undefined,
  responseLength: number,
  toolCallCount: number,
  usage?: ModelUsage,
): boolean {
  if (responseLength !== 0 || toolCallCount !== 0) return false;
  const normalizedFinishReason = finishReason?.trim().toLowerCase();
  return (
    normalizedFinishReason !== "stop" &&
    normalizedFinishReason !== "tool-calls" &&
    normalizedFinishReason !== "tool_calls" &&
    hasZeroUsage(usage)
  );
}

export function buildSuspiciousEmptyDiagnostics(input: {
  finishReason: string | undefined;
  providerMetadata: Record<string, unknown> | undefined;
  rawFinishReason: string | undefined;
  outboundHeaderKeys?: string[];
}): Record<string, unknown> {
  const failure = findProviderBusinessFailureInMetadata(input.providerMetadata);
  return {
    finishReason: input.finishReason ?? null,
    rawFinishReason: input.rawFinishReason ?? null,
    outboundHeaderKeys: input.outboundHeaderKeys ?? [],
    providerMetadataKeys: input.providerMetadata
      ? Object.keys(input.providerMetadata).slice(0, 20)
      : [],
    providerBusinessCodeFromMetadata: failure?.providerCode ?? null,
    providerBusinessMessageFromMetadata: failure?.message ?? null,
    responseBodySummaryFromMetadata: failure?.responseBodySummary ?? null,
  };
}

export function finalizeSuspiciousEmptyModelResult(input: {
  finishReason: string | undefined;
  model: {
    modelId: string;
    providerId: string;
  };
  providerMetadata: Record<string, unknown> | undefined;
  rawFinishReason: string | undefined;
}): void {
  const providerMetadata = input.providerMetadata;
  const failureModel = input.model;
  const failure = findProviderBusinessFailureInMetadata(providerMetadata);
  if (failure) {
    throw createCoreError(CoreErrorType.ModelError, failure.message, {
      context: {
        ...(failureModel
          ? { modelId: failureModel.modelId, providerId: failureModel.providerId }
          : {}),
        ...(failure.providerCode ? { providerCode: failure.providerCode } : {}),
        source: "provider",
        ...(failure.responseBodySummary
          ? { responseBodySummary: failure.responseBodySummary }
          : {}),
      },
      recoverable: true,
      retryable: false,
    });
  }
  const finishReason = input.finishReason;
  const rawFinishReason = input.rawFinishReason;
  const model = input.model;
  throw createCoreError(
    CoreErrorType.ModelError,
    "Model returned no text, no tool calls, and no usage before completing the turn.",
    {
      context: {
        finishReason,
        ...(model ? { modelId: model.modelId, providerId: model.providerId } : {}),
        rawFinishReason,
        reason: "empty_model_response",
        source: "provider",
        suspiciousEmpty: true,
      },
      recoverable: true,
      retryable: true,
    },
  );
}

export function normalizeStreamError(error: unknown): Error {
  const businessError = createCoreErrorFromProviderBusinessLike(error);
  if (businessError) return businessError;
  if (error instanceof Error) return error;
  return new Error(
    typeof error === "string" ? error : (JSON.stringify(error) ?? "Model stream failed"),
  );
}

export function isModelContextExceededError(error: unknown): boolean {
  const seen = new WeakSet<object>();
  let current = error;
  for (let depth = 0; depth <= 6; depth += 1) {
    if (current === null || typeof current !== "object" || seen.has(current)) {
      return false;
    }
    seen.add(current);
    if (isCoreError(current) && current.type === CoreErrorType.ModelContextExceeded) {
      return true;
    }
    const record = current as Record<string, unknown>;
    if (
      isContextMarker(stringProperty(record, "type")) ||
      isContextMarker(stringProperty(record, "code")) ||
      isContextMarker(stringProperty(record, "reason")) ||
      isContextMarker(stringProperty(record, "stopReason")) ||
      isContextMessage(stringProperty(record, "message"))
    ) {
      return true;
    }
    if (isPlainRecord(record.context)) {
      const context = record.context;
      if (
        context &&
        (isContextMarker(stringProperty(context, "type")) ||
          isContextMarker(stringProperty(context, "code")) ||
          isContextMarker(stringProperty(context, "reason")))
      ) {
        return true;
      }
    }
    current = record.cause ?? record.lastError ?? record.error;
  }
  return false;
}

export function isModelMediaTooLargeError(error: unknown): boolean {
  const seen = new WeakSet<object>();
  let current = error;
  for (let depth = 0; depth <= 6; depth += 1) {
    if (current === null || typeof current !== "object" || seen.has(current)) {
      return false;
    }
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (
      isMediaMarker(stringProperty(record, "type")) ||
      isMediaMarker(stringProperty(record, "code")) ||
      isMediaMarker(stringProperty(record, "reason")) ||
      isMediaMessage(stringProperty(record, "message"))
    ) {
      return true;
    }
    if (isPlainRecord(record.context)) {
      const context = record.context;
      if (
        context &&
        (isMediaMarker(stringProperty(context, "type")) ||
          isMediaMarker(stringProperty(context, "code")) ||
          isMediaMarker(stringProperty(context, "reason")))
      ) {
        return true;
      }
    }
    current = record.cause ?? record.lastError ?? record.error;
  }
  return false;
}
