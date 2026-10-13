// SPDX-License-Identifier: Apache-2.0
// 运行取消：把外部信号转发成按 runId 索引的内部控制器，并返回可释放的句柄。
import { abortForwarder } from "./runtime-context-helpers.js";

/** 取消注册表所需的最小上下文。 */
export interface AbortRegistry {
  activeRunAbortControllers: Map<string, AbortController>;
}

/** 外部信号已中止时立即转发，否则挂一次性监听；无外部信号时什么都不做。 */
const attachExternal = (external: AbortSignal | undefined, forward: () => void): void => {
  if (external === undefined) return;
  if (external.aborted) {
    forward();
    return;
  }
  external.addEventListener("abort", forward, { once: true });
};

/** 释放外部监听：幂等，未注册时无副作用。 */
const detachExternal = (external: AbortSignal | undefined, forward: () => void): void => {
  external?.removeEventListener("abort", forward);
};

/** 释放句柄：解绑外部监听，并在仍是当前控制器时从注册表移除。 */
const makeDisposer =
  (
    registry: AbortRegistry,
    runId: string,
    controller: AbortController,
    external: AbortSignal | undefined,
    forward: () => void,
  ) =>
  (): void => {
    detachExternal(external, forward);
    if (registry.activeRunAbortControllers.get(runId) === controller) {
      registry.activeRunAbortControllers.delete(runId);
    }
  };

/** 注册取消信号：建控制器 → 附加外部转发 → 返回句柄。 */
export function registerRunAbortSignal(
  registry: AbortRegistry,
  runId: string,
  externalSignal: AbortSignal | undefined,
): { dispose: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const forward = abortForwarder(controller, externalSignal);
  registry.activeRunAbortControllers.set(runId, controller);
  attachExternal(externalSignal, forward);
  return {
    dispose: makeDisposer(registry, runId, controller, externalSignal, forward),
    signal: controller.signal,
  };
}
