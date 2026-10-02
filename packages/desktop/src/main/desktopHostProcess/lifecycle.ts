import type { UtilityProcess } from "electron";
import { HostMessageTypes } from "@knorvia/shared";
export interface HostLifecycleState {
  exited: WeakSet<UtilityProcess>;
  disposing: Set<UtilityProcess>;
}
type Logger = { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
type Timers = WeakMap<UtilityProcess, ReturnType<typeof setTimeout>>;
export function beginHostDisposal(
  state: HostLifecycleState,
  child: UtilityProcess,
  label: string,
  timers: Timers,
  logger: Logger,
  delay: number = 300,
): void {
  if (timers.has(child)) return;
  state.disposing.add(child);
  logger.info(
    `[disposeHostProcess] disposing host process (${label}), pid=${child.pid ?? "unknown"}`,
  );
  try {
    child.postMessage({ type: HostMessageTypes.Dispose });
  } catch (error) {
    logger.warn(`[disposeHostProcess] failed to post dispose to (${label}):`, error);
  }
  const timeout = setTimeout(
    () => {
      timers.delete(child);
      try {
        child.kill();
      } catch (error) {
        logger.warn(`[disposeHostProcess] failed to kill host process (${label}):`, error);
      }
    },
    Math.max(delay, 30000),
  );
  timers.set(child, timeout);
  child.once("exit", () => {
    state.exited.add(child);
    state.disposing.delete(child);
    clearTimeout(timeout);
    timers.delete(child);
  });
}
export function awaitHostDisposal(
  state: HostLifecycleState,
  child: UtilityProcess,
  label: string,
  timers: Timers,
  logger: Logger,
  options: { forceKillDelayMs?: number; waitTimeoutMs?: number },
): Promise<void> {
  if (state.exited.has(child)) return Promise.resolve();
  const delay = Math.max(
    options.waitTimeoutMs ?? 0,
    (options.forceKillDelayMs ?? 30000) + 2000,
    32000,
  );
  return new Promise<void>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      resolve();
    };
    child.once("exit", () => {
      state.exited.add(child);
      finish();
    });
    if (delay > 0) {
      timeout = setTimeout(() => {
        logger.warn(
          `[disposeHostProcessAndWait] host process exit wait timed out (${label}), pid=${child.pid ?? "unknown"}`,
        );
        finish();
      }, delay);
      timeout.unref?.();
    }
    beginHostDisposal(state, child, label, timers, logger, options.forceKillDelayMs);
  });
}
