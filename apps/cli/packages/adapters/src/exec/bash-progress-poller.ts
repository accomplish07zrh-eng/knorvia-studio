// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// bash 输出进度的共享轮询表。同一个轮询周期只开一个定时器，多个调用方挂在同一格里；
// 每格里的订阅者各自持有「正在读」标记，避免慢读被下一拍重入。
// 定时器 unref，不阻止进程退出；订阅者全部退订时同步关掉该格的定时器。

/** 一笔订阅：读取中标记 + 读取实现。 */
type Slot = {
  /** 上一拍还没结束时置位，用来跳过本拍。 */
  busy: boolean;
  /** 读一次；参数回答「这轮还要不要继续」。 */
  read: (alive: () => boolean) => Promise<void>;
};

/** 一个周期对应的一格：装订阅者的容器 + 驱动它的定时器。 */
type Dial = { slots: Set<Slot>; ticker: NodeJS.Timeout };

/** 周期 → 格。周期相同的调用方共用同一格。 */
const dials = new Map<number, Dial>();

/** 一拍到期：对格内每笔订阅各触发一次受保护的读取。 */
function advance(dial: Dial): void {
  for (const slot of dial.slots) {
    if (slot.busy) continue;
    slot.busy = true;
    const alive = () => dial.slots.has(slot);
    void Promise.resolve(slot.read(alive))
      // 进度读取失败只影响这一拍，不能连带停掉同周期其它会话的进度。
      .catch(() => undefined)
      .finally(() => {
        slot.busy = false;
      });
  }
}

/** 开一格；周期至少 1 毫秒，避免 setInterval 退化成 0 的忙循环。 */
function openDial(everyMs: number): Dial {
  const dial: Dial = {
    slots: new Set<Slot>(),
    ticker: setInterval(() => advance(dial), Math.max(1, everyMs)),
  };
  dial.ticker.unref();
  return dial;
}

/** 订阅进度，返回退订函数。重复调用退订函数是安全的。 */
export function subscribeBashOutputProgress(everyMs: number, read: Slot["read"]): () => void {
  let dial = dials.get(everyMs);
  if (dial === undefined) {
    dial = openDial(everyMs);
    dials.set(everyMs, dial);
  }
  const owned = dial;
  const slot: Slot = { busy: false, read };
  owned.slots.add(slot);
  let retired = false;
  return () => {
    if (retired) return;
    retired = true;
    if (!owned.slots.delete(slot)) return;
    // 还有别的订阅者时保留定时器；最后一笔退订才真正关格。
    if (owned.slots.size > 0) return;
    clearInterval(owned.ticker);
    // 只在格仍挂在表上时摘除，避免误删后来重建的同一周期。
    if (dials.get(everyMs) === owned) dials.delete(everyMs);
  };
}
