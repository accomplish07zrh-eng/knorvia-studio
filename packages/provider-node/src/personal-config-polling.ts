// SPDX-License-Identifier: Apache-2.0
// 轮询调度器：按固定间隔重复执行一次「检查文件是否变化」的动作。
//
// 抽成独立模块的理由：调度有三处微妙之处，与仓储的读改写逻辑无关——
//   1. **单飞**：同一时刻只允许一个检查在跑，避免慢盘上堆积；
//   2. **写代次**：本进程刚写过文件时，那次写入自身会改变文件 mtime，
//      若不丢弃「跨越了一次写入」的结果，就会把自己的写当成外部变更广播；
//   3. **错误节流**：同一次故障持续期间只上报一次，恢复后才允许再次上报。
import type { ProviderConfigLayerSnapshot } from "@knorvia/provider";

/** 一次检查的观察结果。 */
interface PollSnapshot {
  readonly layer: ProviderConfigLayerSnapshot;
  /** 检查期间本进程是否发生过写入；为真时本次结果必须丢弃。 */
  readonly writeGeneration: number;
}

interface PollingControllerOptions {
  /** 间隔；`false` 表示不轮询。 */
  readonly intervalMs: number | false;
  /** 读一次当前文件状态。失败会进入错误分支。 */
  readonly inspect: () => Promise<PollSnapshot>;
  /** 当前写代次，用于判断检查期间是否发生写入。 */
  readonly currentWriteGeneration: () => number;
  /** 检测到外部变更时调用；`revision` 已确认与上次观察到的不同。 */
  readonly onChanged: (revision: string) => void;
  /** 故障时调用；同一段故障内只调一次。 */
  readonly onFailure: (error: unknown) => void;
  /** 是否已被外部关闭（关闭后不再调度、也不再上报）。 */
  readonly isClosed: () => boolean;
}

export interface PollingController {
  /** 安排下一次检查；重复调用在已有安排时是空操作。 */
  arm(): void;
  /** 停止调度并清掉挂起的定时器。 */
  stop(): void;
}

export function createPollingController(options: PollingControllerOptions): PollingController {
  let handle: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  /** 当前是否处于「已上报过错误」的故障段内；成功一次即清空。 */
  let faultReported = false;
  /** 上一次观察到的 revision，用于判等。 */
  let observed: string | undefined;

  const stop = (): void => {
    if (handle !== undefined) {
      clearTimeout(handle);
      handle = undefined;
    }
  };

  const inspectOnce = async (): Promise<void> => {
    inFlight = true;
    const generationAtStart = options.currentWriteGeneration();
    try {
      const snapshot = await options.inspect();
      // 检查期间发生过写入 → 结果已过期，直接丢弃（见文件头第 2 点）。
      if (generationAtStart !== options.currentWriteGeneration()) return;
      faultReported = false;
      if (options.isClosed() || snapshot.layer.revision === observed) return;
      observed = snapshot.layer.revision;
      options.onChanged(snapshot.layer.revision);
    } catch (error) {
      // 已关闭、代次变化、或本故障段内已上报过 → 静默（见文件头第 3 点）。
      if (
        generationAtStart !== options.currentWriteGeneration() ||
        options.isClosed() ||
        faultReported
      ) {
        return;
      }
      faultReported = true;
      options.onFailure(error);
    } finally {
      inFlight = false;
      arm();
    }
  };

  const arm = (): void => {
    if (options.intervalMs === false) return;
    if (handle !== undefined || inFlight || options.isClosed()) return;
    handle = setTimeout(() => {
      handle = undefined;
      void inspectOnce();
    }, options.intervalMs);
    // 计时器不应阻止进程退出。
    handle.unref?.();
  };

  return { arm, stop };
}
