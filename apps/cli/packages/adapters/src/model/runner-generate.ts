// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { Logger, ModelStatusSink, ModelTextResult } from "@knorvia/contracts";
import type { EnvRecord } from "./model-execution.js";
import { detectProviderBusinessFinishError } from "./provider-finish-business-error.js";
import type { ResolvedAiSdkModelRetryOptions } from "./retry-policy.js";
import type {
  AiSdkModelRuntime,
  AiSdkModelTextRequest,
  ResolvedAiSdkModel,
} from "./runner-runtime.js";
import { createGenerateTextOptions } from "./runner-options.js";
import {
  normalizeReasoning,
  normalizeSources,
  normalizeToolCalls,
  normalizeToolResults,
  normalizeUsage,
} from "./runner-normalization.js";
import { classifyModelFailure, findProviderBusinessError } from "./failure-classifier.js";
import { retryAllowedByFailurePolicy } from "./workflow-model-failure-policy.js";
import { admitAttempt } from "./request-admission.js";
import {
  admissionWaitPublishers,
  createAttemptStatusContext,
  createStatusContext,
  publishModelStatus,
} from "./runner-status.js";
import { calculateRetryDelay, sleep, toAdapterError } from "./runner-retry.js";
import { AiSdkModelAdapterError } from "./errors.js";
import { retryBudgetAllows, retryBudgetMaxAttempts } from "./retry-budget.js";
import {
  recordGenerateTextDebug,
  shouldRecordModelIO,
  isDevelopmentModelIOEnv,
} from "./runner-debug.js";
import { isZeroOutputModelCompletion } from "./runner-diagnostics.js";
import { canRetryEmptyCompletion, scheduleEmptyCompletionRetry } from "./empty-completion-retry.js";
import { offPeakTicketExpiredMessage, resolveOffPeakFailureDecision } from "./offpeak-retry.js";
import { resolveAnthropicRequestMetadataUserId } from "./anthropic-request-metadata.js";

async function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw signal.reason;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    ),
  ]);
}
export async function runGenerateText(input: {
  debugDir?: string;
  env: EnvRecord;
  logger?: Logger;
  request: AiSdkModelTextRequest;
  resolveModel: () => ResolvedAiSdkModel;
  resolved: ResolvedAiSdkModel;
  retry: ResolvedAiSdkModelRetryOptions;
  runtime: AiSdkModelRuntime;
  statusSink?: ModelStatusSink;
  modelIoFullRetentionEnabled: boolean;
}): Promise<ModelTextResult> {
  const maxAttempts = input.retry.maxAttempts;
  const context = createStatusContext({
    maxAttempts: retryBudgetMaxAttempts(input.request.modelRetryBudget, maxAttempts),
    request: input.request,
    resolved: input.resolved,
    transport: "http",
  });
  let physicalAttempt = 0;
  let retryBudgetAttempt = 1;
  let emptyRetryCount = 0;
  for (;;) {
    const attempt = ++physicalAttempt;
    const attemptContext = createAttemptStatusContext(context, attempt);
    const wait = admissionWaitPublishers(attemptContext, attempt, {
      logger: input.logger,
      requestStatusSink: input.request.statusSink,
      statusSink: input.statusSink,
    });
    let admission;
    try {
      admission = await admitAttempt({
        admission: input.request.modelRequestAdmission,
        model: input.resolved,
        signal: input.request.abortSignal,
        ...wait,
      });
    } catch (error) {
      throw toAdapterError(
        error,
        classifyModelFailure(error, input.request.abortSignal),
        attemptContext,
        attempt,
        { errorPhase: "connect" },
      );
    }
    const startedAt = Date.now();
    let startedPublished = false;
    let result;
    let resolved = input.resolved;
    let options: ReturnType<typeof createGenerateTextOptions> | undefined;
    try {
      if (input.request.refreshRuntimeHeadersBeforeAttempt) {
        const refreshed = await input.request.refreshRuntimeHeadersBeforeAttempt({
          accountAccess: input.resolved.accountAccess,
          attempt,
          reason: "model-request",
          abortSignal: input.request.abortSignal,
          providerId: input.resolved.providerId,
          modelId: input.resolved.modelId,
          traceContext: input.request.traceContext,
        });
        Object.assign(input.request, { __requestAuth: refreshed.requestAuth });
      }
      resolved = input.resolveModel();
      const anthropicMetadataUserId = await resolveAnthropicRequestMetadataUserId({
        env: input.env,
        providerKind: resolved.providerKind,
        sessionId: attemptContext.sessionId,
      });
      options = createGenerateTextOptions({
        anthropicMetadataUserId,
        includeModelIO: shouldRecordModelIO(input.env),
        request: input.request,
        resolved,
        statusContext: attemptContext,
        env: input.env,
      });
      await publishModelStatus(
        {
          ...attemptContext,
          type: "model_request_started",
          timestamp: new Date().toISOString(),
          attempt,
          requestHeaders: resolved.headers,
        } as never,
        {
          admissionTicket: admission.ticket,
          logger: input.logger,
          requestStatusSink: input.request.statusSink,
          statusSink: input.statusSink,
        },
      );
      startedPublished = true;
      result = await abortable(input.runtime.generateText(options), input.request.abortSignal);
      const business = detectProviderBusinessFinishError({
        providerId: resolved.providerId,
        providerKind: resolved.providerKind,
        source: result,
      });
      if (business) throw business;
      const toolCalls = normalizeToolCalls(result, input.logger);
      const usage = normalizeUsage(result.usage);
      let text = result.text;
      if (input.request.responseJsonSchema) {
        if (result.output === undefined) throw new Error("Structured model output is missing");
        try {
          text = JSON.stringify(result.output);
        } catch (error) {
          throw new Error("Structured model output cannot be serialized", { cause: error });
        }
      }
      const normalized: ModelTextResult = {
        text,
        finishReason: result.finishReason,
        usage,
        reasoning: normalizeReasoning(result.reasoning),
        toolCalls,
        toolResults: normalizeToolResults(result, toolCalls),
        sources: normalizeSources(result),
        providerMetadata: result.providerMetadata,
      };
      if (
        isZeroOutputModelCompletion({
          finishReason: normalized.finishReason,
          reasoningLength:
            normalized.reasoning?.reduce((sum, block) => sum + block.text.length, 0) ?? 0,
          textLength: normalized.text.length,
          toolCallCount: normalized.toolCalls?.length ?? 0,
          usage,
        }) &&
        canRetryEmptyCompletion({
          abortSignal: input.request.abortSignal,
          attempt: retryBudgetAttempt,
          maxAttempts,
          retryCount: emptyRetryCount,
        })
      ) {
        await recordGenerateTextDebug({
          attempt,
          debugDir: input.debugDir,
          error: new Error("Provider returned an empty completion"),
          isDev: isDevelopmentModelIOEnv(input.env),
          modelIoFullRetentionEnabled: input.modelIoFullRetentionEnabled,
          normalizedToolCalls: toolCalls,
          options,
          recordModelIO: shouldRecordModelIO(input.env),
          request: input.request,
          requestId: attemptContext.requestId,
          resolved,
          result,
          startedAt,
        });
        await publishModelStatus(
          {
            ...attemptContext,
            type: "model_request_failed",
            timestamp: new Date().toISOString(),
            attempt,
            durationMs: Date.now() - startedAt,
            reason: "stale_connection",
            retryable: true,
            message: "Provider returned an empty completion",
            errorCode: "model_request_failed",
            errorPhase: "response",
          } as never,
          {
            admissionTicket: admission.ticket,
            logger: input.logger,
            requestStatusSink: input.request.statusSink,
            statusSink: input.statusSink,
          },
        );
        admission.release();
        await scheduleEmptyCompletionRetry({
          abortSignal: input.request.abortSignal,
          attempt,
          completedAt: Date.now(),
          errorPhase: "response",
          logger: input.logger,
          requestHeaders: resolved.headers ?? {},
          requestStatusSink: input.request.statusSink,
          responseHeaders: {},
          retry: input.retry,
          retryBudgetAttempt,
          startedAt,
          statusContext: attemptContext,
          statusSink: input.statusSink,
        });
        emptyRetryCount += 1;
        retryBudgetAttempt += 1;
        continue;
      }
      await publishModelStatus(
        {
          ...attemptContext,
          type: "model_request_completed",
          timestamp: new Date().toISOString(),
          attempt,
          durationMs: Date.now() - startedAt,
          finishReason: normalized.finishReason,
          usage,
        } as never,
        {
          admissionTicket: admission.ticket,
          logger: input.logger,
          requestStatusSink: input.request.statusSink,
          statusSink: input.statusSink,
        },
      );
      admission.release();
      await recordGenerateTextDebug({
        attempt,
        debugDir: input.debugDir,
        isDev: isDevelopmentModelIOEnv(input.env),
        modelIoFullRetentionEnabled: input.modelIoFullRetentionEnabled,
        normalizedToolCalls: toolCalls,
        options,
        recordModelIO: shouldRecordModelIO(input.env),
        request: input.request,
        requestId: attemptContext.requestId,
        resolved,
        result,
        startedAt,
      });
      return normalized;
    } catch (error) {
      if (
        !startedPublished &&
        error instanceof AiSdkModelAdapterError &&
        error.code === "model_request_auth_missing"
      ) {
        throw error;
      }
      const failure = classifyModelFailure(error, input.request.abortSignal);
      if (options)
        await recordGenerateTextDebug({
          attempt,
          debugDir: input.debugDir,
          error,
          isDev: isDevelopmentModelIOEnv(input.env),
          modelIoFullRetentionEnabled: input.modelIoFullRetentionEnabled,
          normalizedToolCalls: [],
          options,
          recordModelIO: shouldRecordModelIO(input.env),
          request: input.request,
          requestId: attemptContext.requestId,
          resolved,
          result,
          startedAt,
        });
      const providerCode = findProviderBusinessError(error)?.providerCode;
      const offPeak = resolveOffPeakFailureDecision({
        offPeak: input.resolved.accountAccess?.mode === "off-peak",
        failure,
        error,
      });
      const canRetry =
        offPeak?.kind === "queued" ||
        (retryAllowedByFailurePolicy(
          failure,
          input.request.modelRetryBudget,
          providerCode === undefined ? undefined : String(providerCode),
        ) &&
          retryBudgetAllows(input.request.modelRetryBudget, retryBudgetAttempt, maxAttempts));
      await publishModelStatus(
        {
          ...attemptContext,
          type: "model_request_failed",
          timestamp: new Date().toISOString(),
          attempt,
          durationMs: Date.now() - startedAt,
          reason: failure.reason,
          retryable: canRetry,
          message: failure.message,
          statusCode: failure.statusCode,
          errorCode: failure.code,
          retryAfterMs: failure.retryAfterMs,
          errorPhase: "response",
        } as never,
        {
          admissionTicket: admission.ticket,
          failureError: error,
          logger: input.logger,
          requestStatusSink: input.request.statusSink,
          statusSink: input.statusSink,
        },
      );
      if (offPeak?.kind === "ticketExpired") {
        const expired = new Error(offPeakTicketExpiredMessage(failure.message), { cause: error });
        throw toAdapterError(expired, { ...failure, retryable: false }, attemptContext, attempt, {
          errorPhase: "response",
        });
      }
      if (!canRetry)
        throw toAdapterError(error, failure, attemptContext, attempt, { errorPhase: "response" });
      const delayMs =
        offPeak?.kind === "queued"
          ? offPeak.delayMs
          : calculateRetryDelay(input.retry, retryBudgetAttempt, failure.retryAfterMs);
      const retryReason = offPeak?.kind === "queued" ? "offpeak_queued" : failure.retryReason;
      admission.release();
      await publishModelStatus(
        {
          ...attemptContext,
          type: "model_retry_scheduled",
          timestamp: new Date().toISOString(),
          attempt,
          delayMs,
          nextAttempt: attempt + 1,
          reason: retryReason,
          message: failure.message,
        } as never,
        {
          logger: input.logger,
          requestStatusSink: input.request.statusSink,
          statusSink: input.statusSink,
        },
      );
      await sleep(delayMs, input.request.abortSignal);
      if (offPeak?.kind !== "queued") retryBudgetAttempt += 1;
    } finally {
      admission.release();
    }
  }
}
