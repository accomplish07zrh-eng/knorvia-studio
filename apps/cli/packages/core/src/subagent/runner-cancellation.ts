// 取消路径上重复出现的取值：错误类型、错误码与可恢复标记，提成常量便于统一维护。
const CANCELLED_ERROR_TYPE = CoreErrorType.ToolCancelled;
const CHILD_RUNTIME_FAILED_CODE = AgentErrorCode.CHILD_RUNTIME_FAILED;
const IS_RECOVERABLE = true;

import {
  AgentErrorCode,
  CoreErrorType,
  DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS,
  createCoreError,
  isCoreError,
  traceContextToLogContext,
} from "@knorvia/contracts";
import type { Execution, RunnerState } from "./runner-state.js";
export function controllerFor(
  state: RunnerState,
  execution: Execution,
  signal?: AbortSignal,
  linked = false,
) {
  const controller = new AbortController();
  state.controllers.set(execution.agentId, controller);
  const forward = () =>
    controller.abort(signal?.reason ?? new Error(`Subagent task aborted: ${execution.agentId}`));
  if (signal?.aborted) forward();
  else if (linked) signal?.addEventListener("abort", forward, { once: true });
  const detach = () => {
    if (linked) signal?.removeEventListener("abort", forward);
  };
  const dispose = () => {
    detach();
    if (state.controllers.get(execution.agentId) === controller)
      state.controllers.delete(execution.agentId);
  };
  return { controller, detach, dispose };
}
export function abortGuard<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  execution: Execution,
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    let alreadySettled = false;
    const settle = (success: boolean, value: unknown) => {
      if (alreadySettled) return;
      alreadySettled = true;
      signal.removeEventListener("abort", aborted);
      if (success) resolve(value as T);
      else reject(value);
    };
    const aborted = () =>
      settle(
        false,
        isCoreError(signal.reason)
          ? signal.reason
          : createCoreError(
              CANCELLED_ERROR_TYPE,
              "Agent was cancelled before the subagent returned findings or background launch completed",
              {
                cause: signal.reason instanceof Error ? signal.reason : undefined,
                context: {
                  code: CHILD_RUNTIME_FAILED_CODE,
                  agentId: execution.agentId,
                  agentType: execution.request.agentType,
                  parentToolCallId: execution.request.parentToolCallId,
                },
                recoverable: IS_RECOVERABLE,
              },
            ),
      );
    promise.then(
      (value) => settle(true, value),
      (error) => settle(false, error),
    );
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
  });
}
export function watchdog(state: RunnerState, execution: Execution, controller: AbortController) {
  const logger = state.options.logger;
  const timeout = state.options.inactivityTimeoutMs ?? DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0)
    return { start() {}, reportActivity() {}, stop() {} };
  let activeAt = Date.now();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };
  const armTimer = () => {
    stop();
    if (controller.signal.aborted) return;
    idleTimer = setTimeout(() => {
      const idleMs = Date.now() - activeAt;
      const error = createCoreError(
        CoreErrorType.ToolTimeout,
        `Subagent was inactive for ${timeout}ms`,
        {
          context: {
            code: CHILD_RUNTIME_FAILED_CODE,
            agentId: execution.agentId,
            agentType: execution.request.agentType,
            idleMs,
            parentToolCallId: execution.request.parentToolCallId,
            timeoutMs: timeout,
          },
          recoverable: IS_RECOVERABLE,
          retryable: true,
        },
      );
      logger?.warn("Explore subagent activity watchdog fired", {
        ...traceContextToLogContext(execution.runTrace),
        agentId: execution.agentId,
        agentType: execution.request.agentType,
        event: "subagent.activity_timeout",
        idleMs,
        module: "core.subagent",
        parentToolCallId: execution.request.parentToolCallId,
        status: "failed",
        timeoutMs: timeout,
      });
      controller.abort(error);
    }, timeout);
  };
  const activity = () => {
    activeAt = Date.now();
    armTimer();
  };
  return { start: activity, reportActivity: activity, stop };
}
export function autoBackground(state: RunnerState, execution: Execution, signal: AbortSignal) {
  let cancel = () => {};
  const promise = new Promise<{ kind: "backgrounded" | "ignored" }>((resolve) => {
    let done = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: "backgrounded" | "ignored") => {
      if (done) return;
      done = true;
      if (idleTimer) clearTimeout(idleTimer);
      signal.removeEventListener("abort", aborted);
      resolve({ kind: result });
    };
    const aborted = () => finish("ignored");
    cancel = aborted;
    if (signal.aborted) {
      aborted();
      return;
    }
    idleTimer = setTimeout(
      () =>
        finish(state.registry.requestBackground(execution.agentId) ? "backgrounded" : "ignored"),
      state.autoBackgroundMs,
    );
    signal.addEventListener("abort", aborted, { once: true });
  });
  return { promise, cancel: () => cancel() };
}
export function readinessGate() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
