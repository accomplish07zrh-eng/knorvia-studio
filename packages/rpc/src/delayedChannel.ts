// SPDX-License-Identifier: Apache-2.0
// 延迟 channel：真实实现尚未就绪时，先给出一个可用的 IChannel 句柄。
//
// 这是装配顺序上的解耦点——调用方可以先取句柄、先挂监听，实现稍后由 promise 兑现。
// 两条不能破的语义：
//   1. 取消令牌必须透传到真正的实现，不能中途丢弃；
//   2. 必须先返回本地 relay 的 event、后接远端事件源，
//      否则「实现到位之前发生的订阅」会永久收不到事件。
import { type CancellationToken, Event, Relay } from "./foundation.js";
import type { IChannel } from "./channels.shared.js";

/** promise 兑现后转交一次 `call`。 */
function deferCall<R>(
  target: Promise<IChannel>,
  command: string,
  arg: any,
  cancellationToken: CancellationToken | undefined,
): Promise<R> {
  return target.then((ready) => ready.call<R>(command, arg, cancellationToken));
}

/**
 * promise 兑现后把远端事件源接到本地 relay 上。
 *
 * 先建 relay 并立刻返回它的 event：调用方在这一刻就能订阅，
 * 而兑现时机不影响「已订阅者最终能收到事件」。
 */
function deferListen<R>(target: Promise<IChannel>, event: string, arg: any): Event<R> {
  const bridge = new Relay<R>();
  void target.then((ready) => {
    bridge.input = ready.listen<R>(event, arg);
  });
  return bridge.event;
}

/**
 * 把 `Promise<IChannel>` 适配成 `IChannel`。
 *
 * 每条方法在**被调用时**才等待 promise，因此兑现失败会落到具体的某次调用上，
 * 而不是变成无人处理的 unhandled rejection。
 */
export function getDelayedChannel<T extends IChannel>(promise: Promise<T>): T {
  const handle = {
    call: (command: string, arg?: any, cancellationToken?: CancellationToken): Promise<any> =>
      deferCall(promise, command, arg, cancellationToken),
    listen: (event: string, arg?: any): Event<any> => deferListen(promise, event, arg),
  };
  return handle as T;
}
