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

interface ModelStatusLogProfile {
  level: "debug" | "info" | "warn";
  label: string;
  project: (event: ModelNetworkStatusEvent) => Record<string, unknown>;
}

const statusLogProfiles: ReadonlyMap<string, ModelStatusLogProfile> = new Map<
  string,
  ModelStatusLogProfile
>([
  [
    "model_request_queued",
    {
      level: "debug",
      label: "Model network request queued for admission",
      project: () => ({
        event: "model.network.queued",
        module: "core.runtime",
        status: "waiting",
      }),
    },
  ],
  [
    "model_request_admitted",
    {
      level: "debug",
      label: "Model network request admitted",
      project: (statusEvent) => {
        const event = statusEvent as Extract<
          ModelNetworkStatusEvent,
          { type: "model_request_admitted" }
        >;
        return {
          event: "model.network.admitted",
          module: "core.runtime",
          queuedMs: event.queuedMs,
          status: "started",
        };
      },
    },
  ],
  [
    "model_request_started",
    {
      level: "debug",
      label: "Model network request started",
      project: () => ({
        event: "model.network.started",
        module: "core.runtime",
        status: "started",
      }),
    },
  ],
  [
    "model_request_completed",
    {
      level: "info",
      label: "Model network request completed",
      project: (statusEvent) => {
        const event = statusEvent as Extract<
          ModelNetworkStatusEvent,
          { type: "model_request_completed" }
        >;
        return {
          durationMs: event.durationMs,
          event: "model.network.completed",
          finishReason: event.finishReason,
          module: "core.runtime",
          status: "completed",
        };
      },
    },
  ],
  [
    "model_request_failed",
    {
      level: "warn",
      label: "Model network request failed",
      project: (statusEvent) => {
        const event = statusEvent as Extract<
          ModelNetworkStatusEvent,
          { type: "model_request_failed" }
        >;
        return {
          durationMs: event.durationMs,
          event: "model.network.failed",
          module: "core.runtime",
          reason: event.reason,
          retryable: event.retryable,
          status: event.reason === "cancelled" ? "cancelled" : "failed",
          statusCode: event.statusCode,
          statusMessage: event.message,
        };
      },
    },
  ],
  [
    "model_retry_scheduled",
    {
      level: "warn",
      label: "Model network retry scheduled",
      project: (statusEvent) => {
        const event = statusEvent as Extract<
          ModelNetworkStatusEvent,
          { type: "model_retry_scheduled" }
        >;
        return {
          delayMs: event.delayMs,
          event: "model.network.retry_scheduled",
          module: "core.runtime",
          nextAttempt: event.nextAttempt,
          reason: event.reason,
          status: "waiting",
          statusCode: event.statusCode,
          statusMessage: event.message,
        };
      },
    },
  ],
  [
    "model_stream_stalled",
    {
      level: "warn",
      label: "Model network stream stalled",
      project: (statusEvent) => {
        const event = statusEvent as Extract<
          ModelNetworkStatusEvent,
          { type: "model_stream_stalled" }
        >;
        return {
          event: "model.network.stream_stalled",
          idleMs: event.idleMs,
          module: "core.runtime",
          status: "waiting",
          statusMessage: event.message,
          timeoutMs: event.timeoutMs,
        };
      },
    },
  ],
]);

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

  const profile = statusLogProfiles.get(statusEvent.type);
  if (profile) {
    this.logger?.[profile.level](profile.label, {
      ...metadata,
      ...profile.project(statusEvent),
    });
  }
}
