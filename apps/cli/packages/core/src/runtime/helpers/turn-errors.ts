import {
  CoreErrorType,
  SessionEventType,
  createCoreError,
  createModelUsageSummaryFromEvents,
  isCoreError,
  traceContextToLogContext,
} from "../deps.js";
import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  ErrorPayloadRole,
  projectExecutionErrorPayload,
  withErrorPayloadRole,
} from "../../errors/error-payload.js";
import { isModelContextExceededError } from "./model-errors.js";

export { projectExecutionErrorPayload } from "../../errors/error-payload.js";

interface TurnAbortScope {
  dispose: () => void;
  signal: AbortSignal;
}

const externalFaultMarker = "knorvia.externalTurnFault";

type ExternalTurnFault = Error & { code: string };

function findExternalFault(error: unknown): ExternalTurnFault | null {
  const seen = new WeakSet<object>();
  let current = error;
  for (let depth = 0; depth <= 6; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) {
      return null;
    }
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (
      record.knorviaTurnFault === externalFaultMarker &&
      typeof record.code === "string" &&
      current instanceof Error
    ) {
      return current as ExternalTurnFault;
    }
    current = record.cause;
  }
  return null;
}

export function createExternalTurnFaultError(
  code: string,
  message: string = code,
): Error {
  return Object.assign(new Error(message), {
    code,
    knorviaTurnFault: externalFaultMarker,
  });
}

export function createTurnAbortScope(parentSignal?: AbortSignal): TurnAbortScope {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(parentSignal?.reason);
    }
  };
  if (parentSignal?.aborted) {
    abort();
    return { dispose: () => {}, signal: controller.signal };
  }
  parentSignal?.addEventListener("abort", abort, { once: true });
  return {
    dispose: () => parentSignal?.removeEventListener("abort", abort),
    signal: controller.signal,
  };
}

export function throwIfTurnAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createTurnCancelledError(signal.reason);
  }
}

export function createTurnFailureError(
  error: unknown,
  abortSignal: AbortSignal | undefined,
  fallbackMessage: string,
): ReturnType<typeof createCoreError> {
  const externalFault =
    findExternalFault(abortSignal?.reason) ?? findExternalFault(error);
  if (externalFault) {
    return createCoreError(CoreErrorType.UnknownError, externalFault.message, {
      cause: externalFault,
      recoverable: true,
    });
  }
  if (isTurnCancellationError(error, abortSignal)) {
    return createTurnCancelledError(error);
  }
  if (
    isCoreError(error) &&
    (error.type === CoreErrorType.ModelContextExceeded ||
      (fallbackMessage === "Turn execution failed" &&
        error.type === CoreErrorType.ModelError))
  ) {
    return error;
  }
  if (isModelContextExceededError(error)) {
    return createCoreError(
      CoreErrorType.ModelContextExceeded,
      "Model request exceeded the provider context window.",
      {
        cause: error instanceof Error ? error : undefined,
        recoverable: true,
        retryable: true,
      },
    );
  }
  return createCoreError(CoreErrorType.UnknownError, fallbackMessage, {
    cause: error instanceof Error ? error : undefined,
    context: withErrorPayloadRole(undefined, ErrorPayloadRole.Wrapper),
  });
}

export function createTurnCancelledError(
  error: unknown,
): ReturnType<typeof createCoreError> {
  if (isCoreError(error) && error.type === CoreErrorType.TurnCancelled) {
    return error;
  }
  return createCoreError(CoreErrorType.TurnCancelled, "Turn was cancelled.", {
    cause: error instanceof Error ? error : undefined,
    recoverable: true,
  });
}

export async function appendTurnOutcomeEvent(
  runtime: AgentRuntimeInternal,
  params: {
    coreError: ReturnType<typeof createTurnFailureError>;
    events: SessionEvent[];
    durationMs: number;
    turnPhase: string;
    inputId?: string;
    traceContext: TraceContext;
    fallbackMessage: string;
    logEvent: string;
    logLabel: string;
    preserveQueueAutoDrainOnCancel?: boolean;
    backgroundSubagentResultConsumed?: boolean;
    workflowResultConsumed?: boolean;
    historyRoundCount?: number;
  },
): Promise<void> {
  const { coreError, events, traceContext, turnPhase, inputId } = params;
  const cancelled = coreError.type === CoreErrorType.TurnCancelled;
  const externalFault = findExternalFault(coreError);
  const outcomeEvent = cancelled
    ? runtime.createEvent(
        SessionEventType.TurnComplete,
        {
          response: "",
          tokenCount: 0,
          usage: createModelUsageSummaryFromEvents(events),
          toolCallCount: 0,
          historyRoundCount: params.historyRoundCount ?? 0,
          duration: params.durationMs,
          resultType: "cancelled",
          inputId,
          ...(params.backgroundSubagentResultConsumed
            ? { backgroundSubagentResultConsumed: true }
            : {}),
          ...(params.workflowResultConsumed
            ? { workflowResultConsumed: true }
            : {}),
          ...(params.preserveQueueAutoDrainOnCancel
            ? { preserveQueueAutoDrainOnCancel: true }
            : {}),
        },
        traceContext,
      )
    : runtime.createEvent(
        SessionEventType.TurnError,
        {
          error: {
            type: externalFault?.code ?? coreError.type,
            ...projectExecutionErrorPayload(coreError, params.fallbackMessage),
            stack: coreError.stack,
          },
          turnPhase,
          inputId,
          ...(params.backgroundSubagentResultConsumed
            ? { backgroundSubagentResultConsumed: true }
            : {}),
          ...(params.workflowResultConsumed
            ? { workflowResultConsumed: true }
            : {}),
        },
        traceContext,
      );
  await runtime.appendEvent(outcomeEvent, traceContext);
  events.push(outcomeEvent);
  runtime.logger?.error(`${params.logLabel} failed`, coreError, {
    ...traceContextToLogContext(traceContext),
    event: params.logEvent,
    module: "core.runtime",
    status: cancelled ? "cancelled" : "failed",
    turnPhase,
  });
}

export function isTurnCancellationError(
  error: unknown,
  abortSignal?: AbortSignal,
): boolean {
  if (findExternalFault(abortSignal?.reason) || findExternalFault(error)) {
    return false;
  }
  if (abortSignal?.aborted) {
    return true;
  }
  const seen = new WeakSet<object>();
  let current = error;
  for (let depth = 0; depth <= 6; depth += 1) {
    if (current === undefined || current === null || typeof current !== "object") {
      return false;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    if (isCoreError(current) && current.type === CoreErrorType.TurnCancelled) {
      return true;
    }
    const record = current as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : undefined;
    const code = typeof record.code === "string" ? record.code : undefined;
    const name = typeof record.name === "string" ? record.name : undefined;
    if (
      type === CoreErrorType.TurnCancelled ||
      code === CoreErrorType.TurnCancelled ||
      code === "MODEL_REQUEST_CANCELLED" ||
      code === "model_request_cancelled" ||
      code === "ABORT_ERR" ||
      name === "AbortError"
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}
