import { randomUUID } from "node:crypto";
import { createWindowsComputerDriver } from "./windows-driver.js";
import { WindowsComputerState } from "./windows-state.js";
import {
  WINDOWS_COMPUTER_TOOLS,
  WindowsComputerUseError,
  failure,
  nativeObservation,
  nativeWindow,
  parseComputerArguments,
  parseComputerContext,
  reject,
  result,
  sameWindow,
  validateImageAction,
} from "./windows-contract.js";

export { WINDOWS_COMPUTER_TOOLS, WindowsComputerUseError } from "./windows-contract.js";
export { createWindowsComputerDriver } from "./windows-driver.js";

function bounded(value, fallback, minimum, maximum) {
  return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(value, maximum)) : fallback;
}

export function createWindowsComputerUseRuntime(options = {}) {
  const now = options.now ?? Date.now;
  const driver = options.driver ?? createWindowsComputerDriver(options);
  const observationTtlMs = bounded(options.observationTtlMs, 15000, 1, 15000);
  const driverTimeoutMs = bounded(options.driverTimeoutMs, 15000, 1, 60000);
  const closing = new Map();
  const closeScope = (scopeId) => {
    if (closing.has(scopeId)) return closing.get(scopeId);
    const promise = Promise.resolve(driver.closeScope?.(scopeId));
    closing.set(scopeId, promise);
    promise.then(
      () => closing.delete(scopeId),
      () => closing.delete(scopeId),
    );
    return promise;
  };
  const state = new WindowsComputerState({
    now,
    scopeTtlMs: bounded(options.scopeTtlMs, 5 * 60000, 1, 30 * 60000),
    requestTtlMs: bounded(options.requestTtlMs, 5 * 60000, 1, 5 * 60000),
    maxScopes: bounded(options.maxScopes, 32, 1, 128),
    maxRequests: bounded(options.maxRequests, 128, 1, 256),
    onStop: closeScope,
  });
  const cleanupTimer = setInterval(() => state.sweep(), 30000);
  cleanupTimer.unref?.();
  let tail = Promise.resolve();

  const invoke = async (scope, method, params, signal) => {
    state.assertLive(scope);
    signal.throwIfAborted();
    // 驱动仅收到 runtime 自己保存的窗口/几何和严格白名单动作，不透传模型任意字段。
    try {
      return await driver(
        { method, params },
        { signal, timeoutMs: driverTimeoutMs, scopeId: scope.key },
      );
    } catch (error) {
      if (["foreground_required", "user_interrupted"].includes(error?.code)) {
        scope.grant = undefined;
        scope.observation = undefined;
      }
      throw error;
    }
  };
  const observeNative = async (scope, window, focus, signal) =>
    nativeObservation(
      await invoke(
        scope,
        "observe",
        {
          windowId: window.windowId,
          identity: {
            pid: window.pid,
            ...(window.processStartedAt === undefined
              ? {}
              : { processStartedAt: window.processStartedAt }),
            ...(window.driverGeneration === undefined
              ? {}
              : { driverGeneration: window.driverGeneration }),
          },
          ...(focus ? { focus: true } : {}),
        },
        signal,
      ),
    );
  const grantFor = (scope, windowId) => {
    state.assertLive(scope);
    if (!scope.grant || scope.grant.windowId !== windowId)
      reject("access_required", "Request user approval for this window in the current turn first.");
    return scope.grant;
  };
  const publish = (scope, windowId, captured, status, extra = {}) => {
    state.assertLive(scope);
    const capturedAt = now();
    const observation = {
      observationId: `observation_${randomUUID()}`,
      observationVersion: ++scope.version,
      windowId,
      capturedAt,
      expiresAt: capturedAt + observationTtlMs,
      nativeWindow: captured.window,
      frame: captured.frame,
      accessibility: captured.accessibility,
    };
    scope.observation = observation;
    state.touch(scope);
    return result(
      {
        status,
        ...extra,
        windowId,
        observationId: observation.observationId,
        observationVersion: observation.observationVersion,
        capturedAt,
        expiresAt: observation.expiresAt,
        imageWidth: captured.image.width,
        imageHeight: captured.image.height,
        coordinateSpace: "window-image",
        bounds: captured.window.bounds,
        ...(captured.window.dpi === undefined ? {} : { dpi: captured.window.dpi }),
        ...(captured.accessibility ? { accessibility: captured.accessibility } : {}),
        instruction:
          "Use coordinates from this exact image. Re-observe if it expires or the user changes the window.",
      },
      captured.image,
    );
  };
  const list = async (scope, signal) => {
    const native = await invoke(scope, "list_windows", {}, signal);
    state.assertLive(scope);
    if (!native || !Array.isArray(native.windows) || native.windows.length > 4096)
      reject("invalid_driver_result", "The driver returned an invalid window list.");
    const windows = [];
    let encodedBytes = 0;
    for (const value of native.windows.slice(0, 200)) {
      const window = nativeWindow(value);
      const item = {
        windowId: state.rememberWindow(scope, window),
        title: window.title,
        pid: window.pid,
      };
      encodedBytes += Buffer.byteLength(JSON.stringify(item)) + 1;
      if (encodedBytes > 28 * 1024) break;
      windows.push(item);
    }
    return result({ status: "listed", windows, truncated: windows.length < native.windows.length });
  };
  const access = async (scope, args, signal) => {
    const window = state.listedWindow(scope, args.windowId);
    // 旧授权先失效，只有可信 Host alwaysAsk 已通过才会进入本方法；参数没有 approved 入口。
    scope.grant = undefined;
    scope.observation = undefined;
    const captured = await observeNative(scope, window, true, signal);
    if (!sameWindow(window, captured.window, false))
      reject("window_changed", "The selected window identity changed.");
    state.assertLive(scope);
    scope.grant = { windowId: args.windowId, window: captured.window };
    return publish(scope, args.windowId, captured, "access_granted");
  };
  const observe = async (scope, args, signal) => {
    const grant = grantFor(scope, args.windowId);
    // 观察期间先废弃旧帧；失败时不得继续使用之前的坐标。
    scope.observation = undefined;
    const captured = await observeNative(scope, grant.window, false, signal);
    if (!sameWindow(grant.window, captured.window, false))
      reject("window_changed", "The authorized window identity changed.");
    return publish(scope, args.windowId, captured, "observed");
  };
  const action = async (scope, args, signal) => {
    const claim = state.claim(scope, args);
    if (claim.previous)
      return {
        ...claim.previous,
        structuredContent: { ...claim.previous.structuredContent, duplicate: true },
      };
    let actionSent = false;
    let actionSucceeded = false;
    let actionFacts;
    try {
      const grant = grantFor(scope, args.windowId);
      const observation = scope.observation;
      if (
        !observation ||
        observation.observationId !== args.observationId ||
        observation.observationVersion !== args.observationVersion ||
        observation.windowId !== args.windowId
      )
        reject("observation_mismatch", "Use the latest observation from this window and turn.");
      if (observation.expiresAt <= now())
        reject("observation_expired", "The observation expired; observe again.");
      validateImageAction(args.action, observation.frame);
      if (
        args.action.elementToken &&
        !observation.accessibility?.elements.some(
          (element) => element.elementToken === args.action.elementToken,
        )
      )
        reject("element_mismatch", "Use an element token from the latest authorized observation.");
      // Cua 的 get_window_state 会替换 snapshot/token；派发前仅列窗检查，不能刷新旧动作的索引。
      const checked = {
        window: nativeWindow(
          (await invoke(scope, "check_window", { window: grant.window }, signal))?.window,
        ),
      };
      if (!sameWindow(observation.nativeWindow, checked.window))
        reject("window_changed", "The window identity or geometry changed; observe again.");
      if (
        observation.nativeWindow.inputTick !== undefined &&
        checked.window.inputTick !== observation.nativeWindow.inputTick
      ) {
        scope.grant = undefined;
        reject(
          "user_interrupted",
          "User input changed after the observation; request user approval again.",
        );
      }
      if (observation.expiresAt <= now())
        reject("observation_expired", "The observation expired before dispatch; observe again.");
      state.assertLive(scope);
      signal.throwIfAborted();
      // 每个已接纳的动作消费一次观察；Cua 仍对目标和可用的 capture/token 做最终核验。
      scope.observation = undefined;
      actionSent = true;
      const applied = await invoke(
        scope,
        "act",
        {
          window: observation.nativeWindow,
          frame: observation.frame,
          expiresAt: observation.expiresAt,
          action: args.action,
        },
        signal,
      );
      if (applied?.performed !== true)
        throw new WindowsComputerUseError(
          "invalid_driver_result",
          "The action result is uncertain.",
          { dispatched: true, outcome: "unknown" },
        );
      actionSucceeded = true;
      actionFacts = {
        effect: applied.effect ?? "unverifiable",
        verified: applied.effect === "confirmed",
        ...(applied.route ? { route: applied.route } : {}),
        ...(applied.delivery ? { delivery: applied.delivery } : {}),
        ...(applied.escalation ? { escalation: applied.escalation } : {}),
        ...(applied.code ? { code: applied.code } : {}),
      };
      const outcome = actionFacts.verified ? "succeeded" : actionFacts.effect;
      const captured = await observeNative(scope, observation.nativeWindow, false, signal);
      if (!sameWindow(observation.nativeWindow, captured.window, false))
        reject("window_changed", "The window identity changed after the action.");
      const output = publish(scope, args.windowId, captured, "action_performed", {
        requestId: args.requestId,
        outcome,
        ...actionFacts,
        dispatched: true,
        businessTaskComplete: false,
      });
      claim.entry.result = result({
        status: "duplicate",
        requestId: args.requestId,
        outcome,
        ...actionFacts,
        dispatched: true,
        observationId: output.structuredContent.observationId,
        observationVersion: output.structuredContent.observationVersion,
        message: "This request already ran. Observe again; it was not replayed.",
      });
      return output;
    } catch (error) {
      let reported = error;
      if (actionSucceeded) {
        reported = new WindowsComputerUseError(
          "observation_after_action_failed",
          "The driver returned an action result but the follow-up observation failed. It was not replayed.",
          {
            dispatched: true,
            outcome: actionFacts?.verified ? "succeeded" : (actionFacts?.effect ?? "unknown"),
          },
        );
      } else if (
        actionSent &&
        (!(error instanceof WindowsComputerUseError) ||
          error.dispatched ||
          error.outcome === "unknown")
      ) {
        reported = new WindowsComputerUseError(
          "action_outcome_unknown",
          "The action may have happened. This turn is stopped and the request must not be replayed.",
          { dispatched: true, outcome: "unknown" },
        );
        state.stop(scope);
      }
      scope.observation = undefined;
      const output = failure(reported);
      if (claim.entry) claim.entry.result = output;
      return output;
    }
  };
  const run = (scope, name, args, signal) => {
    if (name === "computer_action") return action(scope, args, signal);
    state.assertLive(scope);
    if (name === "computer_list_windows") return list(scope, signal);
    if (name === "computer_request_access") return access(scope, args, signal);
    return observe(scope, args, signal);
  };

  return {
    listTools: () => structuredClone(WINDOWS_COMPUTER_TOOLS),
    execute(input) {
      let scope;
      let args;
      try {
        const context = parseComputerContext(input.context);
        args = parseComputerArguments(input.toolName, input.arguments);
        scope = state.get(context);
        if (input.toolName === "computer_stop") {
          state.stop(scope);
          // 停止屏障同步阻止本 scope 后续派发；只等自己的驱动退出，不等别的会话。
          return Promise.resolve(closing.get(scope.key)).then(() =>
            result({
              status: "stopped",
              cancelsDispatchedActions: false,
              message:
                "No further actions will be dispatched in this turn. Already dispatched actions are not undone.",
            }),
          );
        }
        if (input.signal?.aborted) {
          state.stop(scope);
          reject("turn_stopped", "The computer turn was cancelled.");
        }
      } catch (error) {
        return Promise.resolve(failure(error));
      }
      const controller = new AbortController();
      scope.controllers.add(controller);
      scope.pending++;
      const aborted = () => state.stop(scope);
      input.signal?.addEventListener("abort", aborted, { once: true });
      if (input.signal?.aborted) aborted();
      // 物理桌面只保留一条派发链；不同会话也不能同时移动同一个鼠标。
      const task = tail
        .catch(() => undefined)
        .then(() => run(scope, input.toolName, args, controller.signal))
        .catch((error) => failure(error))
        .finally(() => {
          scope.pending--;
          if (!scope.stopped) state.touch(scope);
          scope.controllers.delete(controller);
          input.signal?.removeEventListener("abort", aborted);
        });
      tail = task;
      return task;
    },
    async closeSession(context) {
      const keys = state.closeSession(parseComputerContext(context));
      await Promise.all(keys.map((key) => closing.get(key)));
    },
    async dispose() {
      state.dispose();
      clearInterval(cleanupTimer);
      await tail;
      await Promise.all(closing.values());
      await driver.dispose?.();
      state.scopes.clear();
    },
  };
}
