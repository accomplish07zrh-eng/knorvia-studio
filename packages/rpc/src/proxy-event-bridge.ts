// SPDX-License-Identifier: Apache-2.0
// 带缓冲的事件桥接：把上游 Event 转成本地 Event，并在无人订阅时暂存值。
//
// 为什么需要缓冲：服务对象的 `onFoo` 属性是「取即得」的事件源，而订阅方可能在
// 上游已经产出若干值之后才挂上监听。桥接层负责把这些提前到达的值留住，
// 首次订阅时补发，此后转为直通。
//
// 状态只有三份：暂存队列、上游句柄、是否已转直通。
import { Emitter, type Event, type IDisposable } from "./foundation.js";

export function createEventBridge<T>(origin: Event<T>): Event<T> {
  /** 已到达但还没有订阅者的值。 */
  const pending: T[] = [];
  /** 是否为直通模式：首次订阅补发完即置真。 */
  let flowing = false;
  let upstream: IDisposable | undefined;

  const hub = new Emitter<T>({
    // 首个订阅者出现时才真正连上游：没有订阅者就不断言上游的生命周期。
    onWillAddFirstListener: () => {
      upstream = origin((value) => {
        if (flowing) {
          hub.fire(value);
          return;
        }
        pending.push(value);
      });
    },
    // 最后一个订阅者离开时断开上游并清空暂存：下一批订阅者应看到「从那之后」的值。
    onDidRemoveLastListener: () => {
      upstream?.dispose();
      upstream = undefined;
      pending.length = 0;
      flowing = false;
    },
  });

  return (listener) => {
    const subscription = hub.event(listener);
    if (!flowing) {
      // 进入直通模式并补发暂存值。先切模式再补发：
      // 补发过程中新到的值若走 pending 会与队列顺序错乱。
      flowing = true;
      const backlog = pending.splice(0);
      for (const value of backlog) {
        hub.fire(value);
      }
    }
    return subscription;
  };
}
