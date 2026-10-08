// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelStreamEvent } from "@knorvia/contracts";
import type { AiSdkModelRuntime, RunStreamTextInput } from "./runner-runtime.js";
import { createStreamTextOptions } from "./runner-options.js";
import { toModelStreamEvent } from "./runner-normalization.js";
import { StreamingToolCallAssembler } from "./streaming-tool-call-assembler.js";
import { isRetrySafePreludeStreamEvent } from "./stream-retry-boundary.js";
import {
  createLinkedAbortController,
  readNextWithStreamIdleTimeout,
} from "./stream-idle-timeout.js";
import { classifyModelFailure, findProviderBusinessError } from "./failure-classifier.js";
import { retryAllowedByFailurePolicy } from "./workflow-model-failure-policy.js";
import { retryBudgetAllows, retryBudgetMaxAttempts } from "./retry-budget.js";
import { admitAttempt } from "./request-admission.js";
import {
  admissionWaitPublishers,
  createAttemptStatusContext,
  createStatusContext,
  publishModelStatus,
} from "./runner-status.js";
import { calculateRetryDelay, sleep, toAdapterError } from "./runner-retry.js";
import { AiSdkModelAdapterError } from "./errors.js";
import {
  recordStreamTextDebug,
  shouldRecordModelIO,
  isDevelopmentModelIOEnv,
} from "./runner-debug.js";
import { canRetryEmptyCompletion, scheduleEmptyCompletionRetry } from "./empty-completion-retry.js";
import { isZeroOutputModelCompletion } from "./runner-diagnostics.js";
import { offPeakTicketExpiredMessage, resolveOffPeakFailureDecision } from "./offpeak-retry.js";
import { detectProviderBusinessFinishError } from "./provider-finish-business-error.js";
import { resolveAnthropicRequestMetadataUserId } from "./anthropic-request-metadata.js";
export async function* runStreamText(input: RunStreamTextInput): AsyncGenerator<ModelStreamEvent> {
  const maxAttempts = input.retry.maxAttempts;
  const context = createStatusContext({
    maxAttempts: retryBudgetMaxAttempts(input.request.modelRetryBudget, maxAttempts),
    request: input.request,
    resolved: input.resolved,
    transport: "sse",
  });
  let physicalAttempt = 0,
    retryBudgetAttempt = 1,
    emptyRetryCount = 0;
  for (;;) {
    const attempt = ++physicalAttempt;
    const attemptContext = createAttemptStatusContext(context, attempt);
    const wait = admissionWaitPublishers(attemptContext, attempt, {
      logger: input.logger,
      requestStatusSink: input.request.statusSink,
      statusSink: input.statusSink,
    });
    const admission = await admitAttempt({
      admission: input.request.modelRequestAdmission,
      model: input.resolved,
      signal: input.request.abortSignal,
      ...wait,
    });
    const linked = createLinkedAbortController(input.request.abortSignal);
    const startedAt = Date.now();
    let startedPublished = false;
    let attemptHandled = false;
    let iterator: AsyncIterator<unknown> | undefined;
    let result: ReturnType<AiSdkModelRuntime["streamText"]> | undefined;
    let resolved = input.resolved;
    let options: ReturnType<typeof createStreamTextOptions> | undefined;
    let errorChunkObserved = false;
    let replayBoundary = false,
      committed = false,
      visible = false;
    let textLength = 0,
      reasoningLength = 0;
    // 首个可见内容（文本、推理或工具调用）到达时刻，用于计算输出速度。
    let firstContentAt: number | undefined;
    let finishEvent: Extract<ModelStreamEvent, { type: "finish" }> | undefined;
    const prelude: ModelStreamEvent[] = [];
    const assembler = new StreamingToolCallAssembler({ logger: input.logger });
    const targets = {
      admissionTicket: admission.ticket,
      logger: input.logger,
      requestStatusSink: input.request.statusSink,
      statusSink: input.statusSink,
    };
    const writeDebug = (error?: unknown): Promise<void> =>
      options
        ? recordStreamTextDebug({
            attempt,
            debugDir: input.debugDir,
            error,
            isDev: isDevelopmentModelIOEnv(input.env),
            modelIoFullRetentionEnabled: input.modelIoFullRetentionEnabled,
            normalizedToolCalls: assembler.snapshotNormalizedToolCalls(),
            options,
            recordModelIO: shouldRecordModelIO(input.env),
            request: input.request,
            requestId: attemptContext.requestId,
            resolved,
            result,
            startedAt,
          })
        : Promise.resolve();
    try {
      if (input.request.refreshRuntimeHeadersBeforeAttempt) {
        const refreshed = await input.request.refreshRuntimeHeadersBeforeAttempt({
          accountAccess: input.resolved.accountAccess,
          attempt,
          reason: "model-request",
          abortSignal: linked.signal,
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
      options = createStreamTextOptions({
        anthropicMetadataUserId,
        includeModelIO: shouldRecordModelIO(input.env),
        request: { ...input.request, abortSignal: linked.signal },
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
        targets,
      );
      startedPublished = true;
      result = input.runtime.streamText(options);
      const activeIterator = result.fullStream[Symbol.asyncIterator]();
      iterator = activeIterator;
      for (;;) {
        const next = await readNextWithStreamIdleTimeout(activeIterator, {
          abortController: linked.controller,
          timeoutMs: input.streamIdleTimeoutMs,
          onTimeout: async (error) =>
            publishModelStatus(
              {
                ...attemptContext,
                type: "model_stream_stalled",
                timestamp: new Date().toISOString(),
                attempt,
                idleMs: error.idleMs,
                timeoutMs: error.timeoutMs,
                message: error.message,
              } as never,
              targets,
            ),
        });
        if (next.done) break;
        const raw = next.value as Record<string, unknown>;
        if (input.request.preserveProviderStreamBoundaries && raw.type === "raw") {
          const rawValue = raw.rawValue as Record<string, unknown> | undefined;
          if (rawValue?.type !== "ping") {
            if (!replayBoundary) {
              replayBoundary = true;
              for (const event of prelude.splice(0)) yield event;
            }
            const boundary =
              rawValue && isRetrySafePreludeStreamEvent.toCompactStreamBoundary(rawValue);
            if (boundary) yield boundary;
            if (rawValue?.type === "content_block_stop") committed = true;
          }
          continue;
        }
        const event = toModelStreamEvent(next.value as never);
        if (!event) continue;
        if (event.type === "error") {
          errorChunkObserved = true;
          throw event.error;
        }
        if (event.type === "finish") {
          const business = detectProviderBusinessFinishError.detectProviderStreamFinishError(
            resolved,
            raw,
            event,
          );
          if (business) throw business;
          finishEvent = event;
          continue;
        }
        for (const normalized of assembler.handle(event)) {
          if (isRetrySafePreludeStreamEvent(normalized) && !visible && !replayBoundary)
            prelude.push(normalized);
          else {
            for (const pending of prelude.splice(0)) yield pending;
            if (normalized.type === "text_delta" && normalized.text) {
              textLength += normalized.text.length;
              visible = true;
            } else if (normalized.type === "reasoning_delta" && normalized.text) {
              reasoningLength += normalized.text.length;
              visible = true;
            } else if (normalized.type === "tool_call") {
              visible = true;
              if (input.request.preserveProviderStreamBoundaries && !committed) {
                committed = true;
                yield {
                  type: "compact_stream_boundary",
                  boundary: "inferred_content_block_stop",
                };
              }
            }
            if (visible) firstContentAt ??= Date.now();
            yield normalized;
          }
        }
      }
      const flushedCalls = assembler.flush();
      const zeroCompletion = isZeroOutputModelCompletion({
        finishReason: finishEvent?.finishReason,
        reasoningLength,
        textLength,
        toolCallCount: assembler.snapshotNormalizedToolCalls().length,
        usage: finishEvent?.usage,
      });
      if (
        !input.request.preserveProviderStreamBoundaries &&
        zeroCompletion &&
        canRetryEmptyCompletion({
          abortSignal: input.request.abortSignal,
          attempt: retryBudgetAttempt,
          maxAttempts,
          retryCount: emptyRetryCount,
        })
      ) {
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
            errorPhase: "stream",
            streamOutputCommitted: false,
          } as never,
          targets,
        );
        admission.release();
        await writeDebug(new Error("Provider returned an empty completion"));
        await scheduleEmptyCompletionRetry({
          abortSignal: input.request.abortSignal,
          attempt,
          completedAt: Date.now(),
          errorPhase: "stream",
          logger: input.logger,
          requestHeaders: input.resolved.headers ?? {},
          requestStatusSink: input.request.statusSink,
          responseHeaders: {},
          retry: input.retry,
          retryBudgetAttempt,
          startedAt,
          statusContext: attemptContext,
          statusSink: input.statusSink,
          streamOutputCommitted: false,
        });
        emptyRetryCount += 1;
        retryBudgetAttempt += 1;
        continue;
      }
      for (const event of prelude.splice(0)) yield event;
      for (const event of flushedCalls) {
        visible = true;
        yield event;
      }
      if (finishEvent) yield finishEvent;
      if (!input.request.preserveProviderStreamBoundaries) committed ||= visible;
      await publishModelStatus(
        {
          ...attemptContext,
          type: "model_request_completed",
          timestamp: new Date().toISOString(),
          attempt,
          durationMs: Date.now() - startedAt,
          // 修复对话底部 tok/s 恒为「—」、步数与缓存不随请求更新：流式路径此前不上报用量与首内容耗时，
          // 会话调试统计（session-debug）因此无法计算生成速度。与非流式路径（runner-generate）保持一致。
          ...(finishEvent
            ? { finishReason: finishEvent.finishReason, usage: finishEvent.usage }
            : {}),
          ...(firstContentAt !== undefined
            ? { timeToFirstContentMs: firstContentAt - startedAt }
            : {}),
          streamOutputCommitted: committed,
        } as never,
        targets,
      );
      attemptHandled = true;
      admission.release();
      await writeDebug();
      return;
    } catch (error) {
      attemptHandled = true;
      if (
        !startedPublished &&
        error instanceof AiSdkModelAdapterError &&
        error.code === "model_request_auth_missing"
      ) {
        throw error;
      }
      if (iterator)
        await isRetrySafePreludeStreamEvent.cleanupStreamAttempt(
          iterator,
          result?.consumeStream.bind(result),
          input.logger,
        );
      const failure = classifyModelFailure(error, input.request.abortSignal);
      const providerCode = findProviderBusinessError(error)?.providerCode;
      const offPeak = resolveOffPeakFailureDecision({
        offPeak: input.resolved.accountAccess?.mode === "off-peak",
        failure,
        error,
      });
      const compactRetryAllowed =
        !input.request.preserveProviderStreamBoundaries ||
        isRetrySafePreludeStreamEvent.compactBodyFailureAllowsRetry(error, errorChunkObserved);
      const canRetry =
        (offPeak?.kind === "queued" && !visible && !replayBoundary) ||
        (!visible &&
          !replayBoundary &&
          compactRetryAllowed &&
          retryAllowedByFailurePolicy(
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
          streamOutputCommitted: replayBoundary,
        } as never,
        { ...targets, failureError: error },
      );
      admission.release();
      if (failure.reason !== "cancelled") await writeDebug(error);
      if (offPeak?.kind === "ticketExpired") {
        const expired = new Error(offPeakTicketExpiredMessage(failure.message), { cause: error });
        throw toAdapterError(expired, { ...failure, retryable: false }, attemptContext, attempt, {
          errorPhase: "stream",
          streamOutputCommitted: committed,
        });
      }
      if (!canRetry)
        throw toAdapterError(error, failure, attemptContext, attempt, {
          errorPhase: "stream",
          streamOutputCommitted: committed,
        });
      const delayMs =
        offPeak?.kind === "queued"
          ? offPeak.delayMs
          : calculateRetryDelay(input.retry, retryBudgetAttempt, failure.retryAfterMs);
      const retryReason = offPeak?.kind === "queued" ? "offpeak_queued" : failure.retryReason;
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
      if (input.request.preserveProviderStreamBoundaries && startedPublished && !attemptHandled)
        await isRetrySafePreludeStreamEvent.closeAbandonedCompactStream({
          ...targets,
          abortController: linked.controller,
          attempt,
          committed,
          consumeStream: result?.consumeStream.bind(result),
          context: attemptContext,
          iterator,
        });
      linked.controller.abort();
      linked.cleanup();
      admission.release();
    }
  }
}
