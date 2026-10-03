import {
  SessionEventType,
  traceContextToLogContext,
  type ModelNetworkStatusEvent,
  type ModelStatusSink,
  type ModelStreamRecoveryStatus,
  type SessionEvent,
  type TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

interface ModelStatusSinkOptions {
  onStatus?: (event: ModelNetworkStatusEvent) => void;
  streamRecovery?: ModelStreamRecoveryStatus;
}

export function createModelStatusSink(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
  events: SessionEvent[],
  options: ModelStatusSinkOptions = {},
): ModelStatusSink {
  const runtime = this;
  return {
    publish: async (statusEvent) => {
      const eventPayload = options.streamRecovery
        ? { ...statusEvent, streamRecovery: options.streamRecovery }
        : statusEvent;

      options.onStatus?.(eventPayload);
      runtime.logModelNetworkStatus(eventPayload, traceContext);
      const event = runtime.createEvent(
        SessionEventType.ModelNetworkStatus,
        eventPayload,
        traceContext,
      );
      await runtime.appendEvent(event, traceContext);
      events.push(event);
    },
  };
}

export function logModelNetworkStatus(
  this: AgentRuntimeInternal,
  statusEvent: ModelNetworkStatusEvent,
  traceContext: TraceContext,
): void {
  const metadata = {
    ...traceContextToLogContext(traceContext),
    attempt: statusEvent.attempt,
    baseURL: statusEvent.baseURL,
    maxAttempts: statusEvent.maxAttempts,
    modelId: statusEvent.modelId,
    providerId: statusEvent.providerId,
    providerKind: statusEvent.providerKind,
    requestId: statusEvent.requestId,
    streamRecoveryAnchorId: statusEvent.streamRecovery?.anchorId,
    streamRecoveryFromRequestId:
      statusEvent.streamRecovery?.recoveredFromRequestId,
    streamRecoveryMaxRetries: statusEvent.streamRecovery?.maxRetries,
    streamRecoveryRetryNumber: statusEvent.streamRecovery?.retryNumber,
    transport: statusEvent.transport,
  };

  switch (statusEvent.type) {
    case "model_request_queued":
      this.logger?.debug("Model network request queued for admission", {
        ...metadata,
        event: "model.network.queued",
        module: "core.runtime",
        status: "waiting",
      });
      break;
    case "model_request_admitted":
      this.logger?.debug("Model network request admitted", {
        ...metadata,
        event: "model.network.admitted",
        module: "core.runtime",
        queuedMs: statusEvent.queuedMs,
        status: "started",
      });
      break;
    case "model_request_started":
      this.logger?.debug("Model network request started", {
        ...metadata,
        event: "model.network.started",
        module: "core.runtime",
        status: "started",
      });
      break;
    case "model_request_completed":
      this.logger?.info("Model network request completed", {
        ...metadata,
        durationMs: statusEvent.durationMs,
        event: "model.network.completed",
        finishReason: statusEvent.finishReason,
        module: "core.runtime",
        status: "completed",
      });
      break;
    case "model_request_failed":
      this.logger?.warn("Model network request failed", {
        ...metadata,
        durationMs: statusEvent.durationMs,
        event: "model.network.failed",
        module: "core.runtime",
        reason: statusEvent.reason,
        retryable: statusEvent.retryable,
        status: statusEvent.reason === "cancelled" ? "cancelled" : "failed",
        statusCode: statusEvent.statusCode,
        statusMessage: statusEvent.message,
      });
      break;
    case "model_retry_scheduled":
      this.logger?.warn("Model network retry scheduled", {
        ...metadata,
        delayMs: statusEvent.delayMs,
        event: "model.network.retry_scheduled",
        module: "core.runtime",
        nextAttempt: statusEvent.nextAttempt,
        reason: statusEvent.reason,
        status: "waiting",
        statusCode: statusEvent.statusCode,
        statusMessage: statusEvent.message,
      });
      break;
    case "model_stream_stalled":
      this.logger?.warn("Model network stream stalled", {
        ...metadata,
        event: "model.network.stream_stalled",
        idleMs: statusEvent.idleMs,
        module: "core.runtime",
        status: "waiting",
        statusMessage: statusEvent.message,
        timeoutMs: statusEvent.timeoutMs,
      });
      break;
  }
}
